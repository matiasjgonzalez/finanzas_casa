@echo off
rem Copias de seguridad de la base que esta en internet (Railway), guardadas CIFRADAS en
rem respaldos\nube. Necesita CLOUD_DATABASE_URL y BACKUP_PUBLIC_KEY en el archivo .env
rem (ver README, "Copias de seguridad en Railway").
rem Uso: respaldo-nube                        baja una copia ahora (doble clic)
rem      respaldo-nube listar                 muestra las copias guardadas
rem      respaldo-nube verificar ARCHIVO      comprueba que una copia se pueda leer
rem      respaldo-nube descifrar ARCHIVO      deja el .zip al lado (necesita la clave privada)
rem      respaldo-nube clave-nueva            crea las claves (una sola vez)
setlocal
cd /d "%~dp0backend"
if "%~1"=="" (
    ".venv\Scripts\python.exe" -m app.backup --nube crear
    echo.
    pause
) else (
    ".venv\Scripts\python.exe" -m app.backup --nube %*
)
