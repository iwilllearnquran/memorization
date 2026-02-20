param(
  [string]$ProjectId = "myquranquest786",
  [string]$Region = "us-central1",
  [string]$ServiceName = "quran-reel-service",
  [string]$Token = ""
)

if ([string]::IsNullOrWhiteSpace($Token)) {
  $Token = Read-Host "Enter REEL_ADMIN_TOKEN for Cloud Run"
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "REEL_ADMIN_TOKEN cannot be empty."
}

$pythonPath = "C:\Users\Abrar\AppData\Local\Programs\Python\Python314\python.exe"
if (Test-Path $pythonPath) {
  $env:CLOUDSDK_PYTHON = $pythonPath
}

gcloud config set project $ProjectId

$tag = Get-Date -Format "yyyyMMdd-HHmmss"
$image = "gcr.io/$ProjectId/${ServiceName}:$tag"

gcloud builds submit . --tag $image --file Dockerfile.reel

gcloud run deploy $ServiceName `
  --image $image `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --set-env-vars "REEL_ADMIN_TOKEN=$Token,REEL_USE_REMOTE_INDOPAK=1"
