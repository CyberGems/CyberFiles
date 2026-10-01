$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$executable = Join-Path $projectRoot 'src-tauri/target/release/cyberfiles.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Release executable not found at $executable. Build CyberFiles before packaging the portable version."
}

$portableDirectory = Join-Path $projectRoot 'src-tauri/target/release/bundle/portable'
New-Item -ItemType Directory -Force -Path $portableDirectory | Out-Null
$archiveName = "CyberFiles_${version}_x64-portable.zip"
$archivePath = Join-Path $portableDirectory $archiveName
$stageRoot = Join-Path $env:TEMP ("CyberFiles-portable-stage-" + [guid]::NewGuid().ToString('N'))
$stagedPackage = Join-Path $stageRoot "CyberFiles_${version}_x64-portable"
New-Item -ItemType Directory -Force -Path $stagedPackage | Out-Null

try {
  Copy-Item -LiteralPath $executable -Destination (Join-Path $stagedPackage 'CyberFiles.exe')
  [System.IO.File]::WriteAllText((Join-Path $stagedPackage 'portable.mode'), 'Portable mode', [System.Text.UTF8Encoding]::new($false))
  $readme = @"
CyberFiles $version, portable edition

Run CyberFiles.exe from this folder. CyberFiles stores its settings and WebView2 profile in the CyberFiles_Data folder beside the executable. Keep this folder writable and move the whole extracted folder when relocating the app.

Microsoft Edge WebView2 Evergreen Runtime is required. It is included with current Windows 11 installations and many updated Windows 10 installations. If it is missing, install it from:
https://developer.microsoft.com/microsoft-edge/webview2/

The portable edition keeps its settings separate from an installed CyberFiles copy. The portable and installed editions can run at the same time.
"@
  [System.IO.File]::WriteAllText((Join-Path $stagedPackage 'README.txt'), $readme, [System.Text.UTF8Encoding]::new($false))
  Compress-Archive -LiteralPath $stagedPackage -DestinationPath $archivePath -CompressionLevel Optimal -Force
  Write-Host "Portable package created: $archivePath"
} finally {
  $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  $resolvedStageRoot = [System.IO.Path]::GetFullPath($stageRoot)
  if (-not $resolvedStageRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a temporary stage outside TEMP: $resolvedStageRoot"
  }
  if (Test-Path -LiteralPath $resolvedStageRoot -PathType Container) {
    Remove-Item -LiteralPath $resolvedStageRoot -Recurse -Force
  }
}
