$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$executable = Join-Path $PSScriptRoot '../release/win-unpacked/Arara Vibes.exe'
$installer = Get-ChildItem (Join-Path $PSScriptRoot '../release/AraraVibes-win-*.exe')
if (@($installer).Count -ne 1) { throw 'Expected exactly one Windows installer' }
foreach ($path in @($executable, $installer.FullName)) {
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path $path))
    if ($null -eq $icon) { throw 'Packaged Windows executable has no icon' }
    $bitmap = $icon.ToBitmap()
    $gold = 0
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
        for ($y = 0; $y -lt $bitmap.Height; $y++) {
            $pixel = $bitmap.GetPixel($x, $y)
            if ($pixel.A -gt 128 -and $pixel.R -gt 160 -and $pixel.G -gt 100 -and $pixel.B -lt 150) { $gold++ }
        }
    }
    $bitmap.Dispose()
    $icon.Dispose()
    if ($gold -lt 10) { throw 'Packaged Windows executable is missing the gold application branding' }
}
$stdout = Join-Path $env:RUNNER_TEMP 'vibes-smoke-stdout.txt'
$stderr = Join-Path $env:RUNNER_TEMP 'vibes-smoke-stderr.txt'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ARARA_VIBES_DISABLE_UPDATES = '1'
$process = Start-Process -FilePath $executable -ArgumentList '--smoke-test' -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
if (-not $process.WaitForExit(60000)) {
    $process.Kill()
    throw 'Packaged Windows application did not complete the smoke test'
}
$process.WaitForExit()
Get-Content $stdout
Get-Content $stderr
if ($process.ExitCode -ne 0) { throw "Packaged Windows smoke test failed: $($process.ExitCode)" }
if (-not (Select-String -Path $stdout -SimpleMatch 'PASS: Arara Vibes rendered with CSS, isolated renderer and working window controls' -Quiet)) {
    throw 'Packaged Windows application did not validate the renderer and controls'
}
