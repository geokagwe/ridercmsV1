<#
E2E test for RiderCMS (PowerShell)
- Save as e2e-run-ridercms.ps1 in C:\Users\maxte\riderCMS
- Edit the CONFIG section below before running.
- Requires: gcloud, firebase CLI already installed & logged in (for DB reads).
#>

# -----------------------------
# CONFIG - EDIT THESE VALUES
# -----------------------------
$FirebaseEmail    = "geokagwe@gmail.com"        # operator/admin email
$FirebasePassword = Read-Host -AsSecureString "Firebase password (will not echo)"; $FirebasePasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($FirebasePassword))
$FirebaseApiKey   = "AIzaSyBw1OvbGUrwcJMUM7DI__maceCZMjMYf9I"  # from Project Settings -> SDK snippet -> apiKey

$TestBooth = "booth001"
$TestMsisdn = "254700000000"

# service URLs (adjust only if different)
$Urls = @{
    allocateNextSlot = "https://allocatenextslot-2tjseqt5pq-ew.a.run.app/allocateNextSlot"
    deposit           = "https://deposit-194585815067.europe-west1.run.app"
    collectionQuote   = "https://collectionquote-2tjseqt5pq-ew.a.run.app"
    collectionPay     = "https://collectionpay-194585815067.europe-west1.run.app"
    setUserMsisdn     = "https://setusermsisdn-2tjseqt5pq-ew.a.run.app"
    closeSession      = "https://closesession-194585815067.europe-west1.run.app"
}
$GcloudProject = "ridercms-ced94"

# -----------------------------
# Helper functions
# -----------------------------
function Write-Log($msg) { Write-Host "$(Get-Date -Format o) $msg" }

function Get-FirebaseTokens {
    param($email, $passwordPlain, $apiKey)
    $url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey"
    $body = @{ email = $email; password = $passwordPlain; returnSecureToken = $true } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $body -TimeoutSec 20
        # r includes idToken, refreshToken, expiresIn (seconds)
        return $r
    } catch {
        Write-Host "Sign-in failed:" $_.Exception.Message -ForegroundColor Red
        if ($_.Exception.Response) {
            $s = $_.Exception.Response.GetResponseStream(); $sr = New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd()
        }
        exit 1
    }
}

function Refresh-IdToken {
    param($refreshToken, $apiKey)
    $url = "https://securetoken.googleapis.com/v1/token?key=$apiKey"
    $body = @{ grant_type="refresh_token"; refresh_token = $refreshToken }
    try {
        $r = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/x-www-form-urlencoded" -TimeoutSec 20
        # r.id_token, r.refresh_token, r.expires_in
        return $r
    } catch {
        Write-Host "Refresh token failed:" $_.Exception.Message -ForegroundColor Red
        if ($_.Exception.Response) {
            $s = $_.Exception.Response.GetResponseStream(); $sr = New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd()
        }
        return $null
    }
}

function Ensure-IdTokenFresh {
    param([ref]$IdTokenRef, [ref]$RefreshTokenRef, [ref]$ExpiryRef, $apiKey)
    # If token expired (or near expiration), refresh
    if ((Get-Date) -ge $ExpiryRef.Value) {
        Write-Log "Refreshing ID token..."
        $new = Refresh-IdToken -refreshToken $RefreshTokenRef.Value -apiKey $apiKey
        if ($null -eq $new) { Write-Host "Could not refresh token" -ForegroundColor Red; exit 1 }
        $IdTokenRef.Value = $new.id_token
        $RefreshTokenRef.Value = $new.refresh_token
        $ExpiryRef.Value = (Get-Date).AddSeconds([int]$new.expires_in - 60)
        Write-Log "Token refreshed; next expiry at $($ExpiryRef.Value)"
    }
}

function Call-AllocateNextSlot {
    param($idToken, $booth, $msisdn, $url)
    $headers = @{ "Authorization" = "Bearer $idToken" }
    $bodyJson = @{ booth = $booth; msisdn = $msisdn } | ConvertTo-Json -Depth 6
    try {
        $r = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $bodyJson -Headers $headers -TimeoutSec 30
        return $r
    } catch {
        Write-Host "allocateNextSlot failed:" $_.Exception.Message -ForegroundColor Red
        if ($_.Exception.Response) { $s=$_.Exception.Response.GetResponseStream(); $sr=New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd() }
        return $null
    }
}

function Call-Deposit {
    param($url, $payload)
    $body = $payload | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$url/collectionPay" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
        return $r
    } catch {
        Write-Host "deposit call failed:" $_.Exception.Message -ForegroundColor Yellow
        if ($_.Exception.Response) { $s=$_.Exception.Response.GetResponseStream(); $sr=New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd() }
        return $null
    }
}

# -----------------------------
# Main
# -----------------------------
Write-Host "Starting RiderCMS E2E test..." -ForegroundColor Cyan

# 1) Sign-in & tokens
Write-Log "Signing in to Firebase ($FirebaseEmail)..."
$tokens = Get-FirebaseTokens -email $FirebaseEmail -passwordPlain $FirebasePasswordPlain -apiKey $FirebaseApiKey
$IdToken = $tokens.idToken
$RefreshToken = $tokens.refreshToken
$TokenExpiry = (Get-Date).AddSeconds([int]$tokens.expiresIn - 60)
Write-Log "Signed in. Token expiry at $TokenExpiry"

# 2) Allocate next slot (ensure token fresh)
$IdTokenRef = [ref] $IdToken; $RefreshTokenRef = [ref] $RefreshToken; $ExpiryRef = [ref] $TokenExpiry
Ensure-IdTokenFresh -IdTokenRef $IdTokenRef -RefreshTokenRef $RefreshTokenRef -ExpiryRef $ExpiryRef -apiKey $FirebaseApiKey

Write-Log "Calling allocateNextSlot for booth=$TestBooth msisdn=$TestMsisdn..."
$allocResp = Call-AllocateNextSlot -idToken $IdTokenRef.Value -booth $TestBooth -msisdn $TestMsisdn -url $Urls.allocateNextSlot
if ($null -eq $allocResp) { Write-Host "Allocation failed. Aborting." -ForegroundColor Red; exit 1 }
Write-Log "allocateNextSlot response: $($allocResp | ConvertTo-Json -Depth 6)"

# determine slot string
$slot = if ($allocResp.slot) { $allocResp.slot } elseif ($allocResp.slotId) { $allocResp.slotId } else { $allocResp }
Write-Log "Allocated slot -> $slot"

# 3) Optionally tell backend which msisdn is at the booth (setUserMsisdn) - best-effort
if ($Urls.setUserMsisdn) {
    try {
        $body = @{ booth = $TestBooth; msisdn = $TestMsisdn; slot = $slot } | ConvertTo-Json
        Invoke-RestMethod -Uri $Urls.setUserMsisdn -Method Post -ContentType "application/json" -Body $body -TimeoutSec 20
        Write-Log "setUserMsisdn called (if endpoint exists)."
    } catch {
        Write-Log "setUserMsisdn not available or returned error (proceeding) - $($_.Exception.Message)"
    }
}

# 4) Simulate deposit/collectionPay (use deployed deposit service)
$depositPayload = @{ msisdn = $TestMsisdn; amount = 100; slot = $slot }
Write-Log "Calling deposit endpoint..."
$depositResp = Call-Deposit -url $Urls.deposit -payload $depositPayload
if ($depositResp) { Write-Log "Deposit response: $($depositResp | ConvertTo-Json -Depth 6)" } else { Write-Log "Deposit returned null or error." }

# 5) Optionally call collectionQuote/collectionPay if you want (skipped by default)
# (Add similar calls if needed)

# 6) Read RTDB for verification (requires firebase CLI logged in)
Write-Host ""
Write-Log "Reading RTDB verification paths (requires firebase CLI & login)..."
try {
    Write-Host "`n/sessionsByMsisdn/$TestMsisdn/current"
    & firebase database:get "/sessionsByMsisdn/$TestMsisdn/current" --project $GcloudProject
} catch { Write-Host "firebase database:get failed for sessionsByMsisdn (ensure firebase CLI logged in & project set)." -ForegroundColor Yellow }
try {
    Write-Host "`n/sessionsBySlot/$TestBooth/$slot"
    & firebase database:get "/sessionsBySlot/$TestBooth/$slot" --project $GcloudProject
} catch { Write-Host "firebase database:get failed for sessionsBySlot." -ForegroundColor Yellow }
try {
    Write-Host "`n/booths/$TestBooth/slots/$slot"
    & firebase database:get "/booths/$TestBooth/slots/$slot" --project $GcloudProject
} catch { Write-Host "firebase database:get failed for booths path." -ForegroundColor Yellow }

Write-Host ""
Write-Log "E2E script finished."
# cleanup sensitive var
Remove-Variable -Name FirebasePasswordPlain -ErrorAction SilentlyContinue
