param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
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
try {
  if ($installer.Length -gt 32MB) {
    $uploadEndpoint = Invoke-RestMethod -Uri "$baseUrl/files/upload_url" -Method Get -Headers $headers
    $uploadUrl = [string]$uploadEndpoint.data
  } else {
    $uploadUrl = "$baseUrl/files"
  }

  $upload = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -Form @{ file = $installer }
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
    Write-ScanResult 'Analysis is still pending. Open the report link for the latest result.'
    return
  }

  $stats = $analysis.data.attributes.stats
  $status = "Completed: $([int]$stats.malicious) malicious, $([int]$stats.suspicious) suspicious, $([int]$stats.harmless) harmless, $([int]$stats.undetected) undetected."
  Write-ScanResult $status
} catch {
  $message = ($_.Exception.Message -replace '[\r\n]+', ' ').Trim()
  if ($message.Length -gt 240) { $message = $message.Substring(0, 240) }
  Write-ScanResult "Scan failed: $message"
}
