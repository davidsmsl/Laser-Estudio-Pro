@echo off
chcp 65001 >nul
title Láser Estudio Pro - Paquete para Microsoft Store
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale Node.js 20 o superior desde https://nodejs.org y vuelva a ejecutar. & pause & exit /b 1)
if not exist tienda.json (
  copy tienda.ejemplo.json tienda.json >nul
  echo Se creo tienda.json. Complete los 3 datos de Partner Center y vuelva a ejecutar este archivo.
  notepad tienda.json
  pause & exit /b 1
)
echo Instalando dependencias...
call npm install || (pause & exit /b 1)
echo Generando paquete MSIX...
call npm run tienda
echo.
echo Si termino bien, el archivo .appx esta en la carpeta dist. Subalo en Partner Center.
pause
