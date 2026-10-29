@echo off
rem Abre la aplicación para las computadoras y celulares de la red de la casa (Wi-Fi o cable).
rem Doble clic sobre este archivo. Muestra la dirección para abrir desde los otros equipos.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prod.ps1" -Red
