param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw 'ffmpeg was not found in PATH. Install ffmpeg or add it to PATH first.'
}

$resolvedInput = Resolve-Path -LiteralPath $InputPath
if (-not $OutputPath) {
  $folder = Split-Path -Parent $resolvedInput
  $name = [IO.Path]::GetFileNameWithoutExtension($resolvedInput)
  $OutputPath = Join-Path $folder "$name-h264.mp4"
}

ffmpeg -hide_banner -loglevel warning -y `
  -i $resolvedInput `
  -c:v libx264 `
  -preset veryfast `
  -crf 20 `
  -pix_fmt yuv420p `
  -c:a aac `
  -movflags +faststart `
  $OutputPath

Write-Host "Converted replay clip:"
Write-Host $OutputPath
