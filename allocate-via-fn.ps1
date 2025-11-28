<#
allocate-via-fn.ps1
Call allocateNextSlot HTTPS function to allocate a slot for a rider.

Usage:
  .\allocate-via-fn.ps1
  .\allocate-via-fn.ps1 -FnUrl "https://allocate-xxxx.a.run.app/allocateNextSlot" -Booth "booth001" -Msisdn "254700000000" -IdToken "ey..."
#>

param(
    [string]$FnUrl      = "https://<REPLACE_WITH_YOUR_FUNCTION_URL>/allocateNextSlot",
    [string]$Booth      = "booth001",
    [string]$Msisdn     = "254700000000",
    [string]$IdToken    = ""      # optional: set if your function expects Authorization: Bearer <id_token>
)

if ($FnUrl -like "*REPLACE_WITH_YOUR_FUNCTION_URL*") {
    Write-Host "WARNING: FnUrl placeholder not replaced. Pass -FnUrl or edit the script to set the function URL." -ForegroundColor Yellow
}

$body = @{
    boothId = $Booth
    msisdn  = $Msisdn
} | ConvertTo-Json

$headers = @{ "Content-Type" = "application/json" }
if ($IdToken -ne "") {
    $headers["Authorization"] = "Bearer $IdToken"
    Write-Host "Using Authorization: Bearer <redacted>" -ForegroundColor Green
} else {
    Write-Host "No Authorization header provided. Ensure the function allows unauthenticated calls or use -IdToken." -ForegroundColor Yellow
}

Write-Host "Calling allocate function: $FnUrl"
Write-Host "Payload: boothId=$Booth msisdn=$Msisdn"

try {
    $resp = Invoke-RestMethod -Uri $FnUrl -Method Post -Body $body -Headers $headers -ContentType "application/json" -ErrorAction Stop
    Write-Host "`nFunction returned:" -ForegroundColor Green
    $resp | ConvertTo-Json -Depth 6
}
catch {
    Write-Host "`nError calling function:" -ForegroundColor Red
    if ($_.Exception.Response -ne $null) {
        try {
            $respBody = $_.Exception.Response.GetResponseStream() |
                       ForEach-Object { $sr = New-Object System.IO.StreamReader($_); $sr.ReadToEnd() }
            Write-Host "Response body:" -ForegroundColor Red
            Write-Host $respBody
        } catch {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
    } else {
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
    exit 2
}
