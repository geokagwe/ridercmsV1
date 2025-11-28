# ================================
# Deploy all missing RiderCMS services
# ================================

$Project = "ridercms-ced94"
$Region  = "europe-west1"

$services = @(
    "collectionquote-service",
    "setusermsisdn-service",
    "getsessionbymsisdn-service",
    "closesession-service"
)

foreach ($svc in $services) {
    $imageName = "$Project/$($svc -replace '-service',''):manual-deploy"
    Write-Host "`nDeploying $svc..." -ForegroundColor Cyan

    try {
        # Build Docker image
        gcloud builds submit --tag gcr.io/$imageName .\$svc

        # Deploy to Cloud Run
        gcloud run deploy ($svc -replace '-service','') `
            --image gcr.io/$imageName `
            --platform managed `
            --region $Region `
            --allow-unauthenticated

        # Get the service URL
        $url = gcloud run services describe ($svc -replace '-service','') --platform managed --region $Region --format 'value(status.url)'
        Write-Host "$svc deployed successfully! Service URL: $url" -ForegroundColor Green

    } catch {
        Write-Host ("ERROR deploying {0}: {1}" -f $svc, $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host "`nAll done. Review output for any errors." -ForegroundColor Magenta
