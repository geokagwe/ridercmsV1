<#
deploy-and-test-ridercms.ps1
Signs in to Firebase, refreshes token if needed, calls allocateNextSlot,
and optionally deploys functions/hosting.

Save to: C:\Users\maxte\riderCMS\deploy-and-test-ridercms.ps1
Run: .\deploy-and-test-ridercms.ps1
#>

# -----------------------------
# CONFIG (leave blank to be prompted)
# -----------------------------
$FirebaseEmail     = ""
$FirebaseApiKey    = ""
$CloudRunAllocate  = "https://allocatenextslot-2tjseqt5pq-ew.a.run.app/allocateNextSlot"

# Test data
$TestBooth = "booth001"
$TestMsisdn = "254700000000"

# Deployment toggles (set true to enable)
$DoDeployFunctions = $false
$DoDeployHosting   = $false

# -----------------------------
# Prompt for missing values
# -----------------------------
if ([string]::IsNullOrWhiteSpace($FirebaseEmail)) {
    $FirebaseEmail = Read-Host "Firebase email (operator/admin)"
}
if ([string]::IsNullOrWhiteSpace($FirebaseApiKey)) {
    $FirebaseApiKey = Read-Host "Firebase Web API Key (from Project Settings -> SDK snippet -> apiKey)"
}

# prompt for password securely
$SecurePwd = Read-Host -AsSecureString "Firebase password (will not echo)"
$FirebasePasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePwd)
)

# -----------------------------
# Function: Sign in (get idToken + refreshToken)
# -----------------------------
function Get-FirebaseTokens {
    param([string]$email, [string]$password, [string]$apiKey)

    Write-Host ""
    Write-Host "Signing in to Firebase..."
    $url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey"
    $body = @{
        email = $email
        password = $password
        returnSecureToken = $true
    } | ConvertTo-Json

    try {
        $resp = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
        $out = @{
            idToken = $resp.idToken
            refreshToken = $resp.refreshToken
            expiresIn = [int]$resp.expiresIn
            localId = $resp.localId
            email = $resp.email
        }
        Write-Host "Signed in:" $out.email
        return $out
    } catch {
        Write-Host "Firebase sign-in failed:" $_.Exception.Message -ForegroundColor Red
        if ($_.Exception.Response -ne $null) {
            try {
                $s = $_.Exception.Response.GetResponseStream()
                $sr = New-Object System.IO.StreamReader($s)
                Write-Host $sr.ReadToEnd()
            } catch {}
        }
        exit 1
    }
}

# -----------------------------
# Function: Refresh ID token using refreshToken
# -----------------------------
function Refresh-IdToken {
    param([string]$refreshToken, [string]$apiKey)

    Write-Host ""
    Write-Host "Refreshing ID token..."
    $url = "https://securetoken.googleapis.com/v1/token?key=$apiKey"
    $body = @{
        grant_type = "refresh_token"
        refresh_token = $refreshToken
    } | ConvertTo-Json

    try {
        $resp = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
        $out = @{
            idToken = $resp.id_token
            refreshToken = $resp.refresh_token
            expiresIn = [int]$resp.expires_in
        }
        Write-Host "Token refreshed."
        return $out
    } catch {
        Write-Host "Refresh failed:" $_.Exception.Message -ForegroundColor Red
        if ($_.Exception.Response -ne $null) {
            try {
                $s = $_.Exception.Response.GetResponseStream()
                $sr = New-Object System.IO.StreamReader($s)
                Write-Host $sr.ReadToEnd()
            } catch {}
        }
        exit 1
    }
}

# -----------------------------
# Function: call allocateNextSlot (returns JSON result)
# -----------------------------
function Allocate-NextSlot {
    param([string]$idToken, [string]$booth, [string]$msisdn)

    $bodyJson = @{ booth = $booth; msisdn = $msisdn } | ConvertTo-Json -Compress
    $headers = @{ "Authorization" = "Bearer $idToken" }

    Write-Host ""
    Write-Host "Calling allocateNextSlot for booth=$booth msisdn=$msisdn..."
    try {
        $resp = Invoke-RestMethod -Uri $CloudRunAllocate -Method Post -Body $bodyJson -ContentType "application/json" -Headers $headers -TimeoutSec 60
        Write-Host "allocateNextSlot response:"
        $resp | ConvertTo-Json
        return $resp
    } catch {
        Write-Host "allocateNextSlot call failed:" $_.Exception.Message -ForegroundColor Red
        if ($_.Exception.Response -ne $null) {
            try {
                $s = $_.Exception.Response.GetResponseStream()
                $sr = New-Object System.IO.StreamReader($s)
                Write-Host $sr.ReadToEnd()
            } catch {}
        }
        return $null
    }
}

# -----------------------------
# Main flow
# -----------------------------
# 1) Sign in
$tokens = Get-FirebaseTokens -email $FirebaseEmail -password $FirebasePasswordPlain -apiKey $FirebaseApiKey
$IdToken = $tokens.idToken
$RefreshToken = $tokens.refreshToken
$TokenExpiry = (Get-Date).AddSeconds($tokens.expiresIn - 60)  # refresh 1 minute early

# 2) Ensure token is fresh
if ((Get-Date) -ge $TokenExpiry) {
    $new = Refresh-IdToken -refreshToken $RefreshToken -apiKey $FirebaseApiKey
    $IdToken = $new.idToken; $RefreshToken = $new.refreshToken
    $TokenExpiry = (Get-Date).AddSeconds($new.expiresIn - 60)
}

# 3) Test allocateNextSlot
$allocResp = Allocate-NextSlot -idToken $IdToken -booth $TestBooth -msisdn $TestMsisdn
if ($allocResp -eq $null) {
    Write-Host ""
    Write-Host "Allocation failed. Aborting further deploy steps." -ForegroundColor Yellow
    exit 1
}

# 4) Optional deployments (uncomment to enable)
if ($DoDeployFunctions) {
    Write-Host ""
    Write-Host "Deploying Cloud Functions..."
    try {
        & firebase deploy --only functions
    } catch {
        Write-Host "firebase deploy failed. Ensure firebase CLI is installed & you're logged in." -ForegroundColor Red
    }
}
if ($DoDeployHosting) {
    Write-Host ""
    Write-Host "Deploying Hosting..."
    try {
        & firebase deploy --only hosting
    } catch {
        Write-Host "firebase deploy hosting failed." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Live test complete. allocateNextSlot returned:" -ForegroundColor Green
$allocResp | ConvertTo-Json

# Cleanup: zero-out plaintext password variable
Remove-Variable -Name FirebasePasswordPlain -ErrorAction SilentlyContinue
[System.GC]::Collect()
