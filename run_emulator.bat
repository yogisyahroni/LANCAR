@echo off
set "ANDROID_HOME=C:\Users\yogis\AppData\Local\Android\Sdk"
set "ANDROID_SDK_ROOT=C:\Users\yogis\AppData\Local\Android\Sdk"
set "PATH=%ANDROID_HOME%\emulator;%ANDROID_HOME%\platform-tools;%PATH%"
cd /d "%ANDROID_HOME%\emulator"
start "" "%ANDROID_HOME%\emulator\emulator.exe" -avd Pixel_6_Pro_customer
