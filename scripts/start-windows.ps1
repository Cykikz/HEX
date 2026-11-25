$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$desktopPath = Join-Path $repo 'apps\desktop'
$electronPath = Join-Path $repo 'node_modules\electron\dist\electron.exe'
$envPath = Join-Path $repo '.env'
$postgresData = Join-Path $repo '.env.runtime\postgres'

function Read-HexSetting([string]$name) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ($null -ne $value) { return $value }
    $pattern = '(?m)^\s*(?:export\s+)?' + [regex]::Escape($name) + '\s*=\s*(?:"([^"\r\n]*)"|''([^''\r\n]*)''|([^\s#\r\n]*))'
    $matches = [regex]::Matches($config, $pattern)
    if ($matches.Count) {
        return ($matches[$matches.Count - 1].Groups | Select-Object -Skip 1 | Where-Object Success).Value
    }
}

function Start-HexProcess([string]$file, [string]$directory, [string]$arguments) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $file
    $info.WorkingDirectory = $directory
    $info.Arguments = $arguments
    $info.UseShellExecute = $false
    return [System.Diagnostics.Process]::Start($info)
}

function Get-HexHealth {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -Headers $headers -TimeoutSec 5
        if ($response.status -eq 'ok' -and $response.db) { return $response }
    } catch [System.Net.WebException] {
        if ($_.Exception.Response.StatusCode -eq 401) {
            throw 'The backend on this port rejected the token in your HEX configuration.'
        }
    }
}

$backend = $null
$lock = $null
$ownsLock = $false
$exitCode = 0
try {
    if (!(Test-Path -LiteralPath $envPath -PathType Leaf)) {
        throw 'Missing .env. Complete HEX setup before using this launcher.'
    }
    foreach ($file in @($electronPath, (Join-Path $desktopPath 'out\main\index.js'), (Join-Path $desktopPath 'out\preload\index.js'), (Join-Path $desktopPath 'out\renderer\index.html'))) {
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
            throw 'The Electron runtime or desktop build is missing. This launcher requires an existing desktop build.'
        }
    }

    $config = Get-Content -LiteralPath $envPath -Raw
    $port = Read-HexSetting 'HEXMIND_PORT'
    if (!$port) { $port = '8765' }
    if ($port -notmatch '^\d{1,5}$' -or [int]$port -lt 1 -or [int]$port -gt 65535) {
        throw 'HEXMIND_PORT must be a valid TCP port.'
    }
    $token = Read-HexSetting 'HEXMIND_API_TOKEN'
    if (!$token) { throw 'Missing HEXMIND_API_TOKEN in the HEX configuration.' }
    $healthUrl = "http://127.0.0.1:$port/api/health"
    $headers = @{ Authorization = "Bearer $token" }

    $lock = New-Object System.Threading.Mutex($false, "Local\HEX-Mind-Launcher-$([int]$port)")
    try { $ownsLock = $lock.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsLock = $true }
    if (!$ownsLock) {
        Write-Host 'HEX is already open or starting.'
        return
    }

    # Use the authenticated API if it is already running, and keep ownership with its launcher.
    $health = Get-HexHealth
    if (!$health -and (Test-Path -LiteralPath (Join-Path $postgresData 'PG_VERSION') -PathType Leaf)) {
        $pgCtl = Get-Command pg_ctl.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (!$pgCtl) { throw 'Add the local PostgreSQL bin directory to PATH so HEX can start its database.' }
        & $pgCtl.Source status -D $postgresData | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'Starting local PostgreSQL...'
            & $pgCtl.Source start -D $postgresData -l (Join-Path $repo '.env.runtime\postgres.log') -w -t 30
            if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL failed to start. See .env.runtime\postgres.log.' }
        }
    }

    if (!$health) {
        $uv = Get-Command uv.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (!$uv) { throw 'uv must be on PATH to start the backend.' }
        # Keep the viewing session lightweight, while honoring explicitly configured settings.
        foreach ($name in @('HEXMIND_CREW_SERVICE_AUTOSTART', 'HEXMIND_CATALOG_AUTO_REFRESH')) {
            if ($null -eq (Read-HexSetting $name)) { [Environment]::SetEnvironmentVariable($name, 'false') }
        }
        $backendPath = Join-Path $repo 'apps\backend'
        Write-Host "Starting the HEX backend on port $port..."
        $backend = Start-HexProcess $uv.Source $backendPath "run --no-sync python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port $port"
        $deadline = [DateTime]::UtcNow.AddSeconds(90)
        do {
            if ($backend.HasExited) { throw "The backend exited with code $($backend.ExitCode). See the output above." }
            $health = Get-HexHealth
            if (!$health) { Start-Sleep -Milliseconds 500 }
        } until ($health -or [DateTime]::UtcNow -ge $deadline)
    }
    if (!$health) { throw 'The HEX backend did not respond within 90 seconds.' }
    if ($health.db -ne 'ok') { throw 'HEX could not connect to its configured database.' }

    $existing = Get-Process -Name electron -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -eq 'H.E.X Mind' -and $_.Path -eq $electronPath }
    if ($existing) {
        Write-Host 'The H.E.X Mind window is already open.'
    } else {
        Remove-Item Env:ELECTRON_RUN_AS_NODE, Env:ELECTRON_RENDERER_URL -ErrorAction SilentlyContinue
        Write-Host 'Opening H.E.X Mind...'
        $desktop = Start-HexProcess $electronPath $desktopPath ('"' + $desktopPath + '"')
        $desktop.WaitForExit()
        if ($desktop.ExitCode -ne 0) { throw "H.E.X Mind exited with code $($desktop.ExitCode)." }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $exitCode = 1
} finally {
    if ($backend -and !$backend.HasExited) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $backend.Id /T /F | Out-Null
    }
    if ($ownsLock) { $lock.ReleaseMutex() }
    if ($lock) { $lock.Dispose() }
}
exit $exitCode
