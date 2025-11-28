# File: check-services-health.ps1

# List of services and their URLs
$services = @{
    "collectionpay" = "https://collectionpay-194585815067.europe-west1.run.app"
    "collectionquote" = "https://collectionquote-2tjseqt5pq-ew.a.run.app"
    "setusermsisdn" = "https://setusermsisdn-2tjseqt5pq-ew.a.run.app"
    "getsessionbymsisdn" = "https://getsessionbymsisdn-2tjseqt5pq-ew.a.run.app"
    "closesession" = "https://closesession-2tjseqt5pq-ew.a.run.app"
}

Write-Host "`nChecking health of deployed services..." -ForegroundColor Cyan

foreach ($svc in $services.Keys) {
    $url = $services[$svc]
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ $svc is up and responding (200 OK)" -ForegroundColor Green
        } else {
            Write-Host "⚠️ $svc responded with status $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ Health check failed for $svc: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nHealth check completed." -ForegroundColor Cyan
