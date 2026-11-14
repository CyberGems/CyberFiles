param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [Parameter(Mandatory = $false)]
  [string]$PortablePath
)

$ErrorActionPreference = 'Stop'
$baseUrl = 'https://www.virustotal.com/api/v3'
$installer = Get-Item -LiteralPath $InstallerPath
$sha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$reportUrl = "https://www.virustotal.com/gui/file/$sha256"

function Write-ScanResult([string]$Status) {
  [pscustomobject]@{
    sha256 = $sha256
    status = $Status
    reportUrl = $reportUrl
  } | ConvertTo-Json -Compress
}

if ([string]::IsNullOrWhiteSpace($env:VIRUSTOTAL_API_KEY)) {
  Write-ScanResult 'Skipped: VIRUSTOTAL_API_KEY is not configured.'
  return
}

$headers = @{ 'x-apikey' = $env:VIRUSTOTAL_API_KEY }

# Submit a file to VirusTotal. Without -Wait it only uploads (enough for the
# release notes link to resolve); with -Wait it polls the analysis and returns
# the verdict line used in the release notes.
function Submit-VirusTotalFile([string]$FilePath, [switch]$Wait) {
  $file = Get-Item -LiteralPath $FilePath
  if ($file.Length -gt 32MB) {
    $uploadEndpoint = Invoke-RestMethod -Uri "$baseUrl/files/upload_url" -Method Get -Headers $headers
    $uploadUrl = [string]$uploadEndpoint.data
  } else {
    $uploadUrl = "$baseUrl/files"
  }

  $upload = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -Form @{ file = $file }
  if (-not $Wait) { return }

  $analysisId = [string]$upload.data.id
  if ([string]::IsNullOrWhiteSpace($analysisId)) {
    throw 'VirusTotal did not return an analysis ID.'
  }

  $analysis = $null
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ($attempt -gt 0) { Start-Sleep -Seconds 20 }
    $escapedAnalysisId = [uri]::EscapeDataString($analysisId)
    $analysis = Invoke-RestMethod -Uri "$baseUrl/analyses/$escapedAnalysisId" -Method Get -Headers $headers
    if ($analysis.data.attributes.status -eq 'completed') { break }
  }

  if ($analysis.data.attributes.status -ne 'completed') {
    return 'Analysis is still pending. Open the report link for the latest result.'
  }

  $stats = $analysis.data.attributes.stats
  return "Completed: $([int]$stats.malicious) malicious, $([int]$stats.suspicious) suspicious, $([int]$stats.harmless) harmless, $([int]$stats.undetected) undetected."
}

try {
  $status = Submit-VirusTotalFile $installer.FullName -Wait

  # The portable archive only needs its report to exist; do not block the
  # release waiting for a second full analysis.
  if ($PortablePath) {
    try {
      Submit-VirusTotalFile $PortablePath | Out-Null
      Write-Host "VirusTotal: portable archive submitted ($PortablePath)"
    } catch {
      Write-Warning "VirusTotal portable upload failed: $($_.Exception.Message)"
    }
  }

  Write-ScanResult $status
} catch {
  $message = ($_.Exception.Message -replace '[\r\n]+', ' ').Trim()
  if ($message.Length -gt 240) { $message = $message.Substring(0, 240) }
  Write-ScanResult "Scan failed: $message"
}
