# verify-allocate-and-db.ps1
# Usage: run from C:\Users\maxte\riderCMS
# Keeps display awake for the duration of the script (no admin needed).

# Keep-awake helper (calls Win API)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SleepUtil {
    [DllImport("kernel32.dll")]
    public static extern uint SetThreadExecutionState(uint esFlags);
    public const uint ES_CONTINUOUS = 0x80000000;
    public const uint ES_DISPLAY_REQUIRED = 0x00000002;
    public const uint ES_SYSTEM_REQUIRED = 0x00000001;
}
"@

# Activate keep-awake
[void][SleepUtil]::SetThreadExecutionState([SleepUtil]::ES_CONTINUOUS -bor [SleepUtil]::ES_DISPLAY_REQUIRED -bor [SleepUtil]::ES_SYSTEM_REQUIRED)
Write-Host "Screen sleep prevented for this session. Running verification..."

# --- BEGIN: allocateNextSlot call (adjust if you need to re-sign in) ---
# If you already ran deploy-and-test-ridercms.ps1 and have $IdToken, use it.
# Otherwise sign in here (uncomment sign-in block and fill API key if needed).

if (-not (Test-Path variable:IdToken) -or [string]::IsNullOrWhiteSpace($IdToken)) {
    # Prompt to sign in and get fresh token
    $Email = Read-Host "Firebase email (operator/admin)"
    $ApiKey = Read-Host "Firebase Web API Key"
    $SecurePwd = Read-Host -AsSecureString "Firebase password (will not echo)"
    $PlainPwd = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePwd))

    $signInUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$ApiKey"
    $signInBody = @{ email = $Email; password = $PlainPwd; returnSecureToken = $true } | ConvertTo-Json
    try {
        $si = Invoke-RestMethod -Uri $signInUrl -Method Post -Body $signInBody -ContentType "application/json"
        $IdToken = $si.idToken
        Write-Host "Signed in as $($si.email)"
    } catch {
        Write-Host "Sign-in failed:" $_.Exception.Message -ForegroundColor Red
        # restore normal sleep behavior then exit
        [void][SleepUtil]::SetThreadExecutionState([SleepUtil]::ES_CONTINUOUS)
        exit 1
    }
}

$FnUrl = "https://allocatenextslot-2tjseqt5pq-ew.a.run.app/allocateNextSlot"
$bodyJson = '{"booth":"booth001","msisdn":"254700000000"}'
$headers = @{ "Authorization" = "Bearer $IdToken" }

try {
    $allocResp = Invoke-RestMethod -Uri $FnUrl -Method Post -Body $bodyJson -ContentType "application/json" -Headers $headers -TimeoutSec 60
    Write-Host "`nallocateNextSlot response:"
    $allocResp | ConvertTo-Json
} catch {
    Write-Host "`nallocateNextSlot failed:" $_.Exception.Message -ForegroundColor Red
    if ($_.Exception.Response -ne $null) {
        try { $s = $_.Exception.Response.GetResponseStream(); $sr = New-Object System.IO.StreamReader($s); Write-Host $sr.ReadToEnd() } catch {}
    }
    [void][SleepUtil]::SetThreadExecutionState([SleepUtil]::ES_CONTINUOUS)
    exit 1
}

# --- Read the relevant RTDB paths (requires firebase CLI installed and logged in)
Write-Host "`nReading DB: /sessionsByMsisdn/254700000000/current"
try {
    firebase database:get /sessionsByMsisdn/254700000000/current --project ridercms-ced94
} catch {
    Write-Host "firebase database:get failed (ensure firebase CLI logged in & installed)." -ForegroundColor Yellow
}

$slot = $allocResp.slot -as [string]
if ([string]::IsNullOrWhiteSpace($slot)) { $slot = $allocResp } 

Write-Host "`nReading DB: /sessionsBySlot/booth001/$slot"
try {
    firebase database:get "/sessionsBySlot/booth001/$slot" --project ridercms-ced94
} catch {
    Write-Host "firebase database:get failed for sessionsBySlot." -ForegroundColor Yellow
}

Write-Host "`nReading DB: /booths/booth001/slots/$slot"
try {
    firebase database:get "/booths/booth001/slots/$slot" --project ridercms-ced94
} catch {
    Write-Host "firebase database:get failed for booths path." -ForegroundColor Yellow
}

# Pause so the screen stays on and you can read results
Write-Host "`nVerification complete. Press Enter to finish and restore normal sleep behavior."
Read-Host

# Restore normal sleep/monitor behavior for this session
[void][SleepUtil]::SetThreadExecutionState([SleepUtil]::ES_CONTINUOUS)
Write-Host "Screen sleep restored to system defaults."
