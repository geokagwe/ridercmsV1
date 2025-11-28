<#
deploy-all-services.ps1
Builds & deploys multiple services to Cloud Run using Cloud Build + Artifact Registry.

Place this script in the parent folder that has a "services" folder (e.g. .\services\deposit, .\services\collectionQuote, ...).
Each service folder must contain a Dockerfile, package.json, app.js (or code that can be built by Cloud Build).

Usage:
  .\deploy-all-services.ps1
  .\deploy-all-services.ps1 -Project ridercms-ced94 -Region europe-west1

Notes:
  - Script will create Artifact Registry repo if missing.
  - Service names and image names will be sanitized to meet registry / Cloud Run rules.
  - If you want to inject secrets, populate $SecretsToInject mapping below.
#>

param(
  [string]$Project = "ridercms-ced94",
  [string]$Region  = "europe-west1",
  [string]$RepoName = "ridercms-images",
  [switch]$AllowUnauthenticated = $true,
  [switch]$RedeployExisting = $true  # if false, will skip service if it already exists on Cloud Run
)

function Abort($msg) { Write-Error $msg; exit 1 }

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { Abort "gcloud CLI not found. Install gcloud and login." }

Write-Host "Project: $Project | Region: $Region | Repo: $RepoName"
gcloud config set project $Project | Out-Null
gcloud config set run/region $Region | Out-Null

# Ensure required APIs
$apis = @("run.googleapis.com","cloudbuild.googleapis.com","artifactregistry.googleapis.com","secretmanager.googleapis.com")
foreach ($api in $apis) { gcloud services enable $api --project $Project --quiet }

# Ensure Artifact Registry exists
$describe = gcloud artifacts repositories describe $RepoName --location=$Region --project=$Project 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating Artifact Registry repository $RepoName..."
  gcloud artifacts repositories create $RepoName --repository-format=docker --location=$Region --project=$Project --description="Images for $Project"
} else {
  Write-Host "Artifact Registry $RepoName exists."
}

# --- Configure your services here: serviceKey => relativePath
$ServiceList = @{
  "deposit" = ".\services\deposit"
  "collectionQuote" = ".\services\collectionQuote"
  "linkOwner" = ".\services\linkOwner"
  "mpesacallback" = ".\services\mpesacallback"
  "initiateSwap" = ".\services\initiateSwap"
  "closeSwap" = ".\services\closeSwap"
  "collectionPay" = ".\services\collectionPay"
}

# Optional: map env var name -> secret resource to inject at deploy time
# Format: "ENV_NAME" = "projects/<project>/secrets/<secret-name>:latest"
$SecretsToInject = @{}
# e.g. $SecretsToInject["MPESA_CONSUMER_KEY"] = "projects/$Project/secrets/mpesa-consumer-key:latest"

foreach ($entry in $ServiceList.GetEnumerator()) {
  $svcKey = $entry.Key
  $src = $entry.Value

  if (-not (Test-Path $src)) {
    Write-Warning "Service source not found for $svcKey at $src - skipping."
    continue
  }

  # sanitize Cloud Run service name (lowercase, alnum and dashes, <=63 chars)
  $svcName = ($svcKey -replace '[^A-Za-z0-9]', '-' ) -replace '(^-+|-+$)', ''
  $svcName = $svcName.ToLower()
  if ($svcName.Length -gt 63) { $svcName = $svcName.Substring(0,63) }

  # if not redeploying and service exists, skip
  if (-not $RedeployExisting) {
    $exists = gcloud run services describe $svcName --region $Region --project $Project 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Service $svcName already exists and RedeployExisting=false. Skipping."
      continue
    }
  }

  # build image tag (safe lowercase)
  $tag = (Get-Date -Format "yyyyMMddHHmmss")
  $imageNameSafe = ($svcKey -replace '[^a-z0-9._-]', '-' ).ToLower()
  if ([string]::IsNullOrWhiteSpace($imageNameSafe)) { $imageNameSafe = $svcName }
  $image = "$Region-docker.pkg.dev/$Project/$RepoName/$($imageNameSafe):$tag"

  Write-Host "`n=== Building $svcKey -> $image ==="
  Push-Location $src
  gcloud builds submit --tag $image .
  if ($LASTEXITCODE -ne 0) { Pop-Location; Abort "Build failed for $svcKey" }
  Pop-Location

  Write-Host "=== Deploying $svcName to Cloud Run ==="
  $deployArgs = @("run","deploy",$svcName,"--image",$image,"--region",$Region,"--project",$Project,"--platform","managed","--set-env-vars","FRONTEND_ORIGIN=https://ridercms-ced94.web.app")

  # inject secrets if specified
  if ($SecretsToInject.Count -gt 0) {
    foreach ($pair in $SecretsToInject.GetEnumerator()) {
      $envName = $pair.Key
      $secretRef = $pair.Value
      $deployArgs += "--set-secrets"
      $deployArgs += "$envName=$secretRef"
    }
  }

  if ($AllowUnauthenticated) { $deployArgs += "--allow-unauthenticated" }

  gcloud @deployArgs
  if ($LASTEXITCODE -ne 0) { Abort "gcloud run deploy failed for $svcName" }

  $url = gcloud run services describe $svcName --region $Region --project $Project --format="value(status.url)"
  Write-Host "Deployed $svcKey as $svcName -> $url" -ForegroundColor Green
}

Write-Host "`n✔ All requested services processed."
