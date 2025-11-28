<#
  deploy-and-verify-all.ps1
  Corrected: removed diff markers and fixed string interpolation bug.
#>

# -----------------------------
# CONFIG - edit as needed
# -----------------------------
$Config = @{
    project       = "ridercms-ced94"
    region        = "europe-west1"
    FirebaseEmail = "geokagwe@gmail.com"
    FirebaseApiKey = "AIzaSyBw1OvbGUrwcJMUM7DI__maceCZMjMYf9I"
    TestBooth     = "booth001"
    TestMsisdn    = "254700000000"
    Urls = @{
        allocateNextSlot = "https://allocatenextslot-2tjseqt5pq-ew.a.run.app/allocateNextSlot"
        collectionPay    = "https://collectionpay-194585815067.europe-west1.run.app/collectionPay"
        deposit          = "https://deposit-194585815067.europe-west1.run.app/collectionPay"
        setUserMsisdn    = "https://setusermsisdn-2tjseqt5pq-ew.a.run.app"
    }
    deployCloudRun = $false
    deployHosting  = $false
}

$FirebaseEmail = $Config.FirebaseEmail
$FirebaseApiKey = $Config.FirebaseApiKey
$TestBooth = $Config.TestBooth
$TestMsisdn = $Config.TestMsisdn
$Urls = $Config.Urls

# -----------------------------
# Firebase token helpers
# -----------------------------
$global:IdToken      = $null
$global:RefreshToken = $null
$global:TokenExpiry  = [datetime]::MinValue

function SignIn-Firebase {
    param($Email, $PlainPassword, $ApiKey)
    $url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey"
    $body = @{ email = $Email; password = $PlainPassword; returnSecureToken = $true } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $body -TimeoutSec 20
        return $r
    } catch {
        Write-Host "Sign-in failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            try { $s=$_.Exception.Response.GetResponseStream(); $sr=New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd() } catch {}
        }
        return $null
    }
}

function Refresh-IdToken {
    param($RefreshToken, $ApiKey)
    $url = "https://securetoken.googleapis.com/v1/token?key=$ApiKey"
    $body = "grant_type=refresh_token&refresh_token=$RefreshToken"
    try {
        $r = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/x-www-form-urlencoded" -Body $body -TimeoutSec 20
        return $r
    } catch {
        Write-Host "Refresh token failed: $($_.Exception.Message)" -ForegroundColor Yellow
        if ($_.Exception.Response) {
            try { $s=$_.Exception.Response.GetResponseStream(); $sr=New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd() } catch {}
        }
        return $null
    }
}

function Ensure-IdToken {
    param()
    if ($global:IdToken -and ((Get-Date) -lt $global:TokenExpiry)) { return $global:IdToken }

    if ($global:RefreshToken) {
        $r = Refresh-IdToken -RefreshToken $global:RefreshToken -ApiKey $FirebaseApiKey
        if ($r -ne $null -and $r.id_token) {
            $global:IdToken = $r.id_token
            $global:RefreshToken = $r.refresh_token
            $expires = [int]$r.expires_in
            $global:TokenExpiry = (Get-Date).AddSeconds($expires - 60)
            Write-Host "Refreshed idToken. Expires in $expires seconds."
            return $global:IdToken
        } else {
            Write-Host "Refresh failed; will prompt for credentials." -ForegroundColor Yellow
        }
    }

    $securePass = Read-Host -AsSecureString "Firebase password (for $FirebaseEmail)"
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    $signin = SignIn-Firebase -Email $FirebaseEmail -PlainPassword $plain -ApiKey $FirebaseApiKey
    if ($signin -ne $null) {
        $global:IdToken = $signin.idToken
        $global:RefreshToken = $signin.refreshToken
        $expires = [int]$signin.expiresIn
        $global:TokenExpiry = (Get-Date).AddSeconds($expires - 60)
        Write-Host "Signed in. idToken expires in $expires seconds."
        return $global:IdToken
    }

    throw "Unable to obtain idToken."
}

# -----------------------------
# allocateNextSlot helper
# -----------------------------
function Allocate-NextSlot {
    param($Booth, $Msisdn, $FnUrl)
    $id = Ensure-IdToken
    if (-not $id) { Write-Host "No idToken available." -ForegroundColor Red; return $null }
    $body = @{ booth = $Booth; msisdn = $Msisdn } | ConvertTo-Json
    $headers = @{ "Authorization" = "Bearer $id" }
    try {
        $resp = Invoke-RestMethod -Uri $FnUrl -Method Post -Headers $headers -Body $body -ContentType "application/json" -TimeoutSec 20
        return $resp
    } catch {
        # use formatted message to avoid interpolation edge-case
        Write-Host ("gcloud run deploy failed for {0}: {1}" -f $Booth, $_.Exception.Message) -ForegroundColor Yellow
        if ($_.Exception.Response) {
            try { $s=$_.Exception.Response.GetResponseStream(); $sr=New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd() } catch {}
        }
        return $null
    }
}

# -----------------------------
# Cloud Run / Hosting helpers
# -----------------------------
function Deploy-CloudRunFromSource {
    param($ServiceName, $SourceDir)
    Write-Host "Building & deploying Cloud Run service $ServiceName from $SourceDir..."
    try {
        & gcloud builds submit --tag "gcr.io/$($Config.project)/$ServiceName:manual-deploy" $SourceDir
    } catch {
        Write-Host "gcloud builds submit failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
    try {
        & gcloud run deploy $ServiceName --image "gcr.io/$($Config.project)/$ServiceName:manual-deploy" --platform managed --region $Config.region --allow-unauthenticated
        return $true
    } catch {
        Write-Host ("gcloud run deploy failed for {0}: {1}" -f $ServiceName, $_.Exception.Message) -ForegroundColor Red
        return $false
    }
}

function Deploy-Hosting {
    Write-Host "Deploying Firebase Hosting..."
    try {
        & firebase deploy --only hosting --project $Config.project
        return $true
    } catch {
        Write-Host "firebase deploy hosting failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# -----------------------------
# Quick verify (allocate + DB reads + sample payment)
# -----------------------------
function Quick-Verify {
    param($IdToken, $Project)
    Write-Host "== Quick verification: allocate -> read DB paths -> call payment endpoints =="
    $allocResp = Allocate-NextSlot -Booth $TestBooth -Msisdn $TestMsisdn -FnUrl $Urls.allocateNextSlot
    if ($allocResp -eq $null) { Write-Host "Allocation failed; aborting quick verify." -ForegroundColor Yellow; return }
    Write-Host "allocateNextSlot response:"
    $allocResp | ConvertTo-Json

    Write-Host "`nReading DB: /sessionsByMsisdn/$TestMsisdn/current"
    try { & firebase database:get "/sessionsByMsisdn/$TestMsisdn/current" --project $Project } catch { Write-Host "firebase database:get failed (ensure firebase CLI logged in & installed)." -ForegroundColor Yellow }

    $slot = $allocResp.slot -as [string]
    if ([string]::IsNullOrWhiteSpace($slot)) { $slot = $allocResp }

    Write-Host "`nReading DB: /sessionsBySlot/$TestBooth/$slot"
    try { & firebase database:get "/sessionsBySlot/$TestBooth/$slot" --project $Project } catch { Write-Host "firebase database:get failed for sessionsBySlot." -ForegroundColor Yellow }

    Write-Host "`nReading DB: /booths/$TestBooth/slots/$slot"
    try { & firebase database:get "/booths/$TestBooth/slots/$slot" --project $Project } catch { Write-Host "firebase database:get failed for booths path." -ForegroundColor Yellow }

    Write-Host "`nPosting sample payment to collectionPay endpoint..."
    $sample = @{ msisdn = $TestMsisdn; amount = 100; slot = $slot } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri $Urls.collectionPay -Method Post -ContentType "application/json" -Body $sample -TimeoutSec 20
        Write-Host "collectionPay response:"; $r | ConvertTo-Json
    } catch {
        Write-Host "collectionPay POST failed: $($_.Exception.Message)"
        if ($_.Exception.Response) { try { $s=$_.Exception.Response.GetResponseStream(); $sr=New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd() } catch {} }
    }
}

# -----------------------------
# MAIN flow
# -----------------------------
Write-Host "Starting deploy-and-verify script for project $($Config.project) region $($Config.region)" -ForegroundColor Cyan

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) { Write-Host "Warning: firebase CLI not found in PATH. Hosting deploy and firebase database:gets will fail." -ForegroundColor Yellow }
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { Write-Host "Warning: gcloud CLI not found in PATH. Cloud Run deploy will fail." -ForegroundColor Yellow }

try {
    $id = Ensure-IdToken
} catch {
    Write-Host "Unable to obtain idToken. Aborting." -ForegroundColor Red
    exit 1
}

if ($Config.deployCloudRun) {
    $svc = "collectionpay"
    $src = ".\collectionpay-service"
    if (Test-Path $src) {
        Deploy-CloudRunFromSource -ServiceName $svc -SourceDir $src | Out-Null
    } else {
        Write-Host "Cloud Run source path $src not found; skipping Cloud Run deploy." -ForegroundColor Yellow
    }
}

if ($Config.deployHosting) {
    Deploy-Hosting | Out-Null
}

Quick-Verify -IdToken $id -Project $Config.project

Write-Host "`nScript finished." -ForegroundColor Green
