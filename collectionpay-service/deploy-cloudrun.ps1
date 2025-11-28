<#
Simple deploy script for one service (build -> push -> Cloud Run deploy)
Edit the variables below if you need to change project, region, repo, or service name.
#>

param(
  [string]$Project = "ridercms-ced94",
  [string]$Region  = "europe-west1",
  [string]$RepoName = "ridercms-images",
  [string]$ServiceName = "collectionPay",        # change to the service you want
  [string]$SourceDir = ".",                      # current folder (.)
  [string]$FrontendOrigin = "https://ridercms-ced94.web.app",
  [switch]$AllowUnauthenticated = $true
)

function Abort($msg) {
  Write-Error $msg
  exit 1
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Abort "gcloud CLI not found. Install gcloud and login (gcloud auth login)."
}

Write-Host "Setting gcloud project to $Project and region to $Region..."
gcloud config set project $Project | Out-Null
gcloud config set run/region $Region | Out-Null

# Ensure required APIs are enabled
$apis = @("run.googleapis.com", "cloudbuild.googleapis.com", "artifactregistry.googleapis.com")
foreach ($api in $apis) {
  Write-Host "Ensuring API enabled: $api"
  gcloud services enable $api --project $Project --quiet
}

# Create Artifact Registry repo if missing
$describe = gcloud artifacts repositories describe $RepoName --location=$Region --project=$Project 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating Artifact Registry repository $RepoName..."
  gcloud artifacts repositories create $RepoName --repository-format=docker --location=$Region --project=$Project --description="Container repo for $Project"
  if ($LASTEXITCODE -ne 0) { Abort "Failed to create Artifact Registry repo." }
} else {
  Write-Host "Artifact Registry repo exists."
}

# Validate source dir
if (-not (Test-Path $SourceDir)) { Abort "Source directory '$SourceDir' not found." }

# Tag image
$tag = (Get-Date -Format "yyyyMMddHHmmss")
# Use $($ServiceName) to avoid parser confusion with the colon
$image = "$Region-docker.pkg.dev/$Project/$RepoName/$($ServiceName):$tag"

Write-Host "Building and pushing image: $image"
Push-Location $SourceDir
gcloud builds submit --tag $image .
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Abort "gcloud builds submit failed."
}
Pop-Location

# Deploy
$deployArgs = @("run","deploy",$ServiceName,"--image",$image,"--region",$Region,"--project",$Project,"--platform","managed","--set-env-vars","FRONTEND_ORIGIN=$FrontendOrigin")
if ($AllowUnauthenticated) { $deployArgs += "--allow-unauthenticated" }

Write-Host "Deploying to Cloud Run..."
gcloud @deployArgs
if ($LASTEXITCODE -ne 0) { Abort "gcloud run deploy failed." }

# Show URL
$serviceUrl = gcloud run services describe $ServiceName --region $Region --project $Project --format="value(status.url)"
if ($serviceUrl) {
  Write-Host "Service URL: $serviceUrl" -ForegroundColor Green
  Write-Host "CORS preflight test (example):"
  Write-Host "curl -i -X OPTIONS `"$serviceUrl/deposit`" -H `"Origin: $FrontendOrigin`" -H `"Access-Control-Request-Method: POST`""
} else {
  Write-Warning "Could not retrieve service URL."
}
