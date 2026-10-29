# Levanta toda la aplicación (backend + frontend) en una sola terminal.
#
# Uso, desde la carpeta del proyecto:   .\dev.ps1
# Para detener todo:                    Ctrl+C
#
# 1. Verifica dependencias y que los puertos 8000 y 5173 estén libres.
# 2. Hace la copia de seguridad del día (si no hay) y aplica las migraciones pendientes.
# 3. Inicia la API (puerto 8000) y el frontend (puerto 5173) y muestra los mensajes de ambos.
# 4. Al salir, cierra los dos procesos (incluidos los procesos hijos de --reload).

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'

# Recarga el PATH por si Node.js se instaló con esta terminal ya abierta.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path', 'User')

function Fail($message) {
    Write-Host "`n$message`n" -ForegroundColor Red
    exit 1
}

# --- 1. Verificaciones -------------------------------------------------------------------
if (-not (Test-Path (Join-Path $root '.env'))) { Fail 'Falta el archivo .env (copiá .env.example y completalo).' }
if (-not (Test-Path $python)) { Fail 'Falta el entorno de Python. Ver README: "Instalación > Backend".' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'No se encontró npm. Instalá Node.js LTS.' }
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'Instalando dependencias del frontend (solo la primera vez)...' -ForegroundColor Cyan
    Push-Location $frontend; npm install; Pop-Location
}
foreach ($port in 8000, 5173) {
    $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($busy) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($busy[0].OwningProcess)"
        Fail ("El puerto $port ya está en uso (PID $($proc.ProcessId): $($proc.Name)).`n" +
              "Probablemente la aplicación ya está corriendo en otra terminal: cerrala primero,`n" +
              "o terminá el proceso con:  taskkill /PID $($proc.ProcessId) /T /F")
    }
}

# --- 2. Copia de seguridad diaria -------------------------------------------------------
# Antes de las migraciones: si algo saliera mal al actualizar la base, hay una copia de hoy.
Push-Location $backend
try {
    & $python -m app.backup automatico
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'ATENCION: no se pudo hacer la copia de seguridad (ver el mensaje de arriba).' -ForegroundColor Yellow
    }
} finally { Pop-Location }

# --- 2b. Migraciones ----------------------------------------------------------------------
Write-Host 'Aplicando migraciones de la base de datos...' -ForegroundColor Cyan
Push-Location $backend
try {
    & $python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { Fail 'No se pudieron aplicar las migraciones. ¿Está iniciado PostgreSQL?' }
} finally { Pop-Location }

# --- 3. Inicio ---------------------------------------------------------------------------
# -NoNewWindow: ambos escriben en esta misma terminal.
$api = Start-Process -FilePath $python -ArgumentList '-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000' `
    -WorkingDirectory $backend -NoNewWindow -PassThru
$web = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' `
    -WorkingDirectory $frontend -NoNewWindow -PassThru

Write-Host ''
Write-Host '  Casa en Orden' -ForegroundColor Green
Write-Host '  Aplicación:  http://localhost:5173'
Write-Host '  API (docs):  http://localhost:8000/api/docs'
Write-Host '  Ctrl+C para detener todo.' -ForegroundColor DarkGray
Write-Host ''

# --- 4. Espera y cierre ------------------------------------------------------------------
try {
    while (-not $api.HasExited -and -not $web.HasExited) { Start-Sleep -Milliseconds 500 }
    if ($api.HasExited) { Write-Host "`nLa API se detuvo. Revisá los mensajes de arriba." -ForegroundColor Red }
    if ($web.HasExited) { Write-Host "`nEl frontend se detuvo. Revisá los mensajes de arriba." -ForegroundColor Red }
} finally {
    # /T cierra también los procesos hijos (uvicorn --reload y Vite crean procesos propios).
    foreach ($proc in $api, $web) {
        if (-not $proc.HasExited) { taskkill /PID $proc.Id /T /F 2>&1 | Out-Null }
    }
    Write-Host 'Aplicación detenida.' -ForegroundColor DarkGray
}
