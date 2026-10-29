@echo off
rem Copias de seguridad de la base y los comprobantes (en la carpeta respaldos).
rem Uso: respaldo                               crea una copia ahora
rem      respaldo listar                        muestra las copias guardadas
rem      respaldo verificar ARCHIVO             comprueba que una copia se pueda leer
rem      respaldo restaurar ARCHIVO --confirmar vuelve al estado de una copia
setlocal
cd /d "%~dp0backend"
if "%~1"=="" (
    ".venv\Scripts\python.exe" -m app.backup crear
) else (
    ".venv\Scripts\python.exe" -m app.backup %*
)
