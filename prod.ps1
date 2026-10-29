# Modo rápido: compila el frontend y lo sirve la propia API, en una sola dirección.
#
# Uso, desde la carpeta del proyecto:   .\prod.ps1      (o doble clic en prod.cmd)
# Para detener:                         Ctrl+C
#
# A diferencia de dev.ps1 (pensado para programar, recarga al guardar cambios), acá el
# navegador recibe el código ya optimizado y comprimido, y lo guarda en caché: la navegación
# es mucho más rápida. Si cambiás el código, volvé a ejecutarlo para recompilar.
#
# Con -Red (.\prod.cmd -Red) la aplicación también se puede abrir desde los celulares y
# computadoras de la red de tu casa (Wi-Fi). Sin -Red, solo desde esta computadora.

param([switch]$Red)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'

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
$busy = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($busy[0].OwningProcess)"
    Fail ("El puerto 8000 ya está en uso (PID $($proc.ProcessId): $($proc.Name)).`n" +
          "Probablemente la aplicación ya está corriendo (dev o prod) en otra terminal: cerrala primero.")
}

# --- 2. Compilación del frontend ---------------------------------------------------------
Push-Location $frontend
try {
    if (-not (Test-Path 'node_modules')) {
        Write-Host 'Instalando dependencias del frontend (solo la primera vez)...' -ForegroundColor Cyan
        npm install
    }
    Write-Host 'Compilando el frontend...' -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { Fail 'No se pudo compilar el frontend. Revisá los mensajes de arriba.' }
} finally { Pop-Location }

# --- 3. Copia de seguridad diaria -------------------------------------------------------
# Antes de las migraciones: si algo saliera mal al actualizar la base, hay una copia de hoy.
Push-Location $backend
try {
    & $python -m app.backup automatico
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'ATENCION: no se pudo hacer la copia de seguridad (ver el mensaje de arriba).' -ForegroundColor Yellow
    }
} finally { Pop-Location }

# --- 3b. Migraciones ----------------------------------------------------------------------
Write-Host 'Aplicando migraciones de la base de datos...' -ForegroundColor Cyan
Push-Location $backend
try {
    & $python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { Fail 'No se pudieron aplicar las migraciones. ¿Está iniciado PostgreSQL?' }
} finally { Pop-Location }

# --- 4. Inicio ---------------------------------------------------------------------------
# 127.0.0.1: solo esta computadora. 0.0.0.0: también los demás equipos de la red de la casa.
$listen = if ($Red) { '0.0.0.0' } else { '127.0.0.1' }
$api = Start-Process -FilePath $python -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', $listen, '--port', '8000' `
    -WorkingDirectory $backend -NoNewWindow -PassThru

Write-Host ''
Write-Host '  Casa en Orden (modo rápido)' -ForegroundColor Green
Write-Host '  En esta computadora:  http://localhost:8000'
if ($Red) {
    # Direcciones de esta computadora en la red local (Wi-Fi o cable).
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -ExpandProperty IPAddress
    foreach ($ip in $ips) { Write-Host "  Desde el celular:     http://${ip}:8000" -ForegroundColor Green }
    Write-Host '  (Windows puede preguntar si permitir Python en redes privadas: respondé que sí.)' -ForegroundColor DarkGray
}
Write-Host '  Ctrl+C para detener.' -ForegroundColor DarkGray
Write-Host ''

try {
    while (-not $api.HasExited) { Start-Sleep -Milliseconds 500 }
    Write-Host "`nLa API se detuvo. Revisá los mensajes de arriba." -ForegroundColor Red
} finally {
    if (-not $api.HasExited) { taskkill /PID $api.Id /T /F 2>&1 | Out-Null }
    Write-Host 'Aplicación detenida.' -ForegroundColor DarkGray
}
