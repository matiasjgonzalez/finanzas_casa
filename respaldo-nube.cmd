@echo off
rem Copias de seguridad de la base que esta en internet (Railway), guardadas en respaldos\nube.
rem Necesita CLOUD_DATABASE_URL en el archivo .env (ver README, "Copias de la base en internet").
rem Uso: respaldo-nube                        baja una copia ahora (doble clic)
rem      respaldo-nube listar                 muestra las copias guardadas
rem      respaldo-nube verificar ARCHIVO      comprueba que una copia se pueda leer
setlocal
cd /d "%~dp0backend"
if "%~1"=="" (
    ".venv\Scripts\python.exe" -m app.backup --nube crear
    echo.
    pause
) else (
    ".venv\Scripts\python.exe" -m app.backup --nube %*
)
