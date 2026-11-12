param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = 'Stop'
$package = Resolve-Path (Join-Path $PSScriptRoot "../release/AraraVibes-x64-$Version.msix")
$tool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\10.*\x64\makeappx.exe' | Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $tool) { throw 'Windows SDK makeappx.exe is missing' }
$destination = Join-Path $env:RUNNER_TEMP ([guid]::NewGuid().ToString())
try {
    & $tool.FullName unpack /p $package /d $destination /o
    if ($LASTEXITCODE -ne 0) { throw 'MSIX unpack failed' }
    [xml]$manifest = Get-Content (Join-Path $destination 'AppxManifest.xml')
    if ($manifest.Package.Identity.Name -ne $env:MSIX_IDENTITY_NAME) { throw 'Incorrect Store identity' }
    if ($manifest.Package.Identity.Publisher -ne $env:MSIX_PUBLISHER) { throw 'Incorrect Store publisher' }
    if ($manifest.Package.Identity.Version -ne "$Version.0") { throw 'Incorrect Store version' }
    if ($manifest.Package.Applications.Application.Id -ne 'AraraVibes') { throw 'Incorrect Store application ID' }
    if ($manifest.Package.Applications.Application.Executable -ne 'Arara Vibes.exe') { throw 'Incorrect Store executable' }
    foreach ($file in @('Arara Vibes.exe', 'resources/app.asar', 'Assets/StoreLogo.png', 'Assets/Square44x44Logo.png', 'Assets/Square150x150Logo.png')) {
        if (-not (Test-Path (Join-Path $destination $file))) { throw "Missing MSIX file: $file" }
    }
    Write-Output 'PASS: Microsoft Store MSIX identity, version, application and logo assets'
} finally {
    if (Test-Path $destination) { Remove-Item $destination -Recurse -Force }
}
