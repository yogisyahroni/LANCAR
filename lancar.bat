@echo off
setlocal EnableDelayedExpansion

set "COMPOSE_FILE=docker-compose.yml"
set "MIGRATIONS_DIR=database/migrations"
set "CMD=%~1"

if "%CMD%"=="" set "CMD=help"

if "%CMD%"=="up"       goto :cmd_up
if "%CMD%"=="down"     goto :cmd_down
if "%CMD%"=="status"   goto :cmd_status
if "%CMD%"=="logs"     goto :cmd_logs
if "%CMD%"=="migrate"  goto :cmd_migrate
if "%CMD%"=="reset"    goto :cmd_reset
if "%CMD%"=="build"    goto :cmd_build
if "%CMD%"=="health"   goto :cmd_health
if "%CMD%"=="frontend" goto :cmd_frontend
if "%CMD%"=="shell"    goto :cmd_shell
goto :cmd_help

:run_compose
    docker compose -f "%COMPOSE_FILE%" %~1
    exit /b %errorlevel%

:cmd_up
    echo.
    echo === Menjalankan Lancar Backend Stack (Docker) ===
    echo.

    echo [1/3] Memulai Infrastructure (DB, Redis, RabbitMQ)...
    call :run_compose "up -d db db-read redis rabbitmq"

    echo.
    echo [2/3] Menjalankan migrasi database (goose)...
    echo    Menunggu database siap...
    timeout /t 5 /nobreak >nul
    goose -dir "%MIGRATIONS_DIR%" postgres "host=localhost port=5432 user=postgres password=1234 dbname=lancar sslmode=disable" up
    if !errorlevel! neq 0 (
        echo    WARN: Migrasi gagal, pastikan database sudah siap.
    ) else (
        echo    Migrasi berhasil!
    )

    echo.
    echo [3/3] Memulai semua backend service...
    call :run_compose "up -d auth-service admin-service order-service routing-service api-gateway"

    echo.
    echo === Stack Lancar Berjalan! ===
    echo.
    echo   API Gateway   : http://localhost:8080
    echo   Auth Service  : http://localhost:8081
    echo   Admin Service : http://localhost:3001
    echo   Order Service : http://localhost:8083
    echo   Routing Svc   : http://localhost:8082
    echo   RabbitMQ UI   : http://localhost:15672  (guest/guest)
    echo   PostgreSQL DB : localhost:5432
    echo   Redis         : localhost:6379
    echo.
    echo   lancar.bat health      - Cek semua endpoint
    echo   lancar.bat logs        - Lihat logs
    echo   lancar.bat frontend    - Jalankan frontend
    goto :eof

:cmd_down
    echo Menghentikan semua service...
    call :run_compose "down"
    echo Semua service dihentikan. Data volume aman.
    goto :eof

:cmd_status
    echo Status Container Lancar:
    docker compose -f "%COMPOSE_FILE%" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    goto :eof

:cmd_logs
    set "SVC=%~2"
    if "%SVC%"=="" set "SVC="
    echo Menampilkan logs... (Ctrl+C untuk berhenti)
    call :run_compose "logs -f --tail=150 %SVC%"
    goto :eof

:cmd_migrate
    echo Menjalankan migrasi database...
    goose -dir "%MIGRATIONS_DIR%" postgres "host=localhost port=5432 user=postgres password=1234 dbname=lancar sslmode=disable" up
    echo Migrasi selesai.
    goto :eof

:cmd_reset
    echo.
    echo PERINGATAN: Reset akan MENGHAPUS semua data database!
    set /p CONFIRM=Ketik 'ya' untuk konfirmasi: 
    if /i "!CONFIRM!"=="ya" (
        echo Menghapus semua container dan volume...
        call :run_compose "down -v"
        echo Reset selesai.
    ) else (
        echo Reset dibatalkan.
    )
    goto :eof

:cmd_build
    echo Build ulang semua images...
    call :run_compose "build"
    echo Build selesai.
    goto :eof

:cmd_health
    echo.
    echo === Health Check Lancar Services ===
    echo.
    powershell -Command "try { $r=(Invoke-WebRequest http://localhost:8080/health -TimeoutSec 3 -EA Stop); Write-Host '  [OK]  API Gateway   :8080' -ForegroundColor Green } catch { Write-Host '  [FAIL] API Gateway  :8080' -ForegroundColor Red }"
    powershell -Command "try { $r=(Invoke-WebRequest http://localhost:8081/health -TimeoutSec 3 -EA Stop); Write-Host '  [OK]  Auth Service  :8081' -ForegroundColor Green } catch { Write-Host '  [FAIL] Auth Service :8081' -ForegroundColor Red }"
    powershell -Command "try { $r=(Invoke-WebRequest http://localhost:3001/health -TimeoutSec 3 -EA Stop); Write-Host '  [OK]  Admin Service :3001' -ForegroundColor Green } catch { Write-Host '  [FAIL] Admin Service :3001' -ForegroundColor Red }"
    powershell -Command "try { $r=(Invoke-WebRequest http://localhost:8083/health -TimeoutSec 3 -EA Stop); Write-Host '  [OK]  Order Service :8083' -ForegroundColor Green } catch { Write-Host '  [FAIL] Order Service :8083' -ForegroundColor Red }"
    powershell -Command "try { $r=(Invoke-WebRequest http://localhost:8082/health -TimeoutSec 3 -EA Stop); Write-Host '  [OK]  Routing Svc  :8082' -ForegroundColor Green } catch { Write-Host '  [FAIL] Routing Svc  :8082' -ForegroundColor Red }"
    goto :eof

:cmd_frontend
    echo Menjalankan Frontend Next.js di http://localhost:3000
    echo API Gateway: http://localhost:8080
    if exist "frontend\package.json" (
        cd frontend
    )
    set "NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1"
    npm run dev
    goto :eof

:cmd_shell
    set "SVC=%~2"
    if "%SVC%"=="" (
        echo Usage: lancar.bat shell [service_name]
        echo Contoh: lancar.bat shell db
        goto :eof
    )
    docker compose -f "%COMPOSE_FILE%" exec -it %SVC% sh || docker compose -f "%COMPOSE_FILE%" exec -it %SVC% bash
    goto :eof

:cmd_help
    echo.
    echo LANCAR - Docker Stack Helper
    echo ============================
    echo.
    echo   lancar.bat up              Jalankan semua backend service
    echo   lancar.bat down            Stop semua service (data aman)
    echo   lancar.bat reset           Stop + hapus semua data
    echo   lancar.bat migrate         Jalankan migrasi DB saja
    echo   lancar.bat logs            Lihat semua logs
    echo   lancar.bat logs [svc]      Logs service tertentu
    echo   lancar.bat status          Status semua container
    echo   lancar.bat frontend        Jalankan frontend Next.js
    echo   lancar.bat build           Build ulang semua images
    echo   lancar.bat health          Health check semua endpoint
    echo   lancar.bat shell [svc]     Shell ke dalam service
    echo.
    goto :eof
