# ================================================================
# lancar.ps1 - Script helper Lancar untuk Docker Compose
#
# CARA PAKAI (buka PowerShell di folder LANCAR):
#   powershell -ExecutionPolicy Bypass -File lancar.ps1 up
#   powershell -ExecutionPolicy Bypass -File lancar.ps1 down
#   powershell -ExecutionPolicy Bypass -File lancar.ps1 status
#   powershell -ExecutionPolicy Bypass -File lancar.ps1 frontend
#   powershell -ExecutionPolicy Bypass -File lancar.ps1 logs
#   powershell -ExecutionPolicy Bypass -File lancar.ps1 health
#   powershell -ExecutionPolicy Bypass -File lancar.ps1 migrate
#   powershell -ExecutionPolicy Bypass -File lancar.ps1 reset
# ================================================================

$Command = if ($args.Count -gt 0) { $args[0] } else { "help" }

# Warna output
function Write-Green  { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Yellow { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Red    { param($msg) Write-Host $msg -ForegroundColor Red }
function Write-Cyan   { param($msg) Write-Host $msg -ForegroundColor Cyan }

# Konfigurasi
$COMPOSE_FILE = "docker-compose.yml"
$MIGRATIONS_DIR = "database/migrations"

# Helper function to run docker compose
function Invoke-Compose {
    param([string]$Arguments)
    docker compose -f $COMPOSE_FILE $Arguments
}

# Cek apakah Docker running
function Assert-DockerRunning {
    docker ps > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Red "GAGAL: Docker tidak ditemukan atau tidak sedang berjalan."
        Write-Yellow "Pastikan Docker Desktop sudah running."
        exit 1
    }
}

# Cek .env
function Ensure-EnvFile {
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Yellow "File .env dibuat dari .env.example."
        } else {
            Write-Red "Tidak ada file .env! Buat manual terlebih dahulu."
            exit 1
        }
    }
}

# ================================================================
# COMMANDS
# ================================================================
switch ($Command.ToLower()) {

    "up" {
        Write-Cyan ""
        Write-Cyan "=== Menjalankan Lancar Backend Stack dengan Docker ==="
        Assert-DockerRunning
        Ensure-EnvFile

        Write-Yellow ""
        Write-Yellow "[1/3] Memulai Infrastructure..."
        Invoke-Compose "up -d db db-read redis rabbitmq"

        Write-Yellow ""
        Write-Yellow "[2/3] Menjalankan migrasi database..."
        Write-Yellow "   Menunggu database siap..."
        Start-Sleep -Seconds 5
        goose -dir "$MIGRATIONS_DIR" postgres "host=localhost port=5432 user=postgres password=1234 dbname=lancar sslmode=disable" up

        Write-Yellow ""
        Write-Yellow "[3/3] Memulai semua backend service..."
        Invoke-Compose "up -d auth-service admin-service order-service routing-service api-gateway"

        Write-Green ""
        Write-Green "=== Semua service berjalan! ==="
        Write-Cyan ""
        Write-Cyan "Endpoint yang tersedia:"
        Write-Host "  API Gateway   : http://localhost:8080"
        Write-Host "  Auth Service  : http://localhost:8081"
        Write-Host "  Admin Service : http://localhost:3001"
        Write-Host "  Order Service : http://localhost:8083"
        Write-Host "  Routing       : http://localhost:8082"
        Write-Host "  RabbitMQ UI   : http://localhost:15672  (guest/guest)"
        Write-Host "  PostgreSQL DB : localhost:5432"
        Write-Host "  Redis         : localhost:6379"
        Write-Cyan ""
        Write-Cyan "Langkah berikutnya:"
        Write-Host "  Jalankan frontend : powershell -ExecutionPolicy Bypass -File lancar.ps1 frontend"
        Write-Host "  Lihat logs        : powershell -ExecutionPolicy Bypass -File lancar.ps1 logs"
        Write-Host "  Health check      : powershell -ExecutionPolicy Bypass -File lancar.ps1 health"
    }

    "down" {
        Write-Yellow "Menghentikan semua service..."
        Invoke-Compose "down"
        Write-Green "Semua service dihentikan. Data volume tetap aman."
    }

    "reset" {
        Write-Red ""
        Write-Red "PERINGATAN: Reset akan MENGHAPUS semua data database!"
        $confirm = Read-Host "Ketik 'ya' untuk konfirmasi"
        if ($confirm -eq "ya") {
            Write-Yellow "Menghapus semua container dan volume..."
            Invoke-Compose "down -v"
            Write-Green "Reset selesai. Jalankan 'up' untuk mulai ulang."
        } else {
            Write-Yellow "Reset dibatalkan."
        }
    }

    "migrate" {
        Write-Yellow "Menjalankan migrasi database..."
        goose -dir "$MIGRATIONS_DIR" postgres "host=localhost port=5432 user=postgres password=1234 dbname=lancar sslmode=disable" up
        Write-Green "Migrasi selesai."
    }

    "logs" {
        $svc = if ($args.Count -gt 1) { $args[1] } else { "" }
        Write-Cyan "Menampilkan logs $svc (Ctrl+C untuk berhenti)..."
        Invoke-Compose "logs -f --tail=150 $svc"
    }

    "status" {
        Write-Cyan "Status Container Lancar:"
        Invoke-Compose "ps"
    }

    "frontend" {
        Write-Cyan "Menjalankan Frontend Next.js..."
        if (-not (Test-Path "package.json") -and (Test-Path "frontend\package.json")) {
            Set-Location "frontend"
        }
        $env:NEXT_PUBLIC_API_URL = "http://localhost:8080/api/v1"
        Write-Green "Frontend: http://localhost:3000"
        Write-Yellow "API terhubung ke Gateway: http://localhost:8080"
        npm run dev
    }

    "build" {
        Write-Yellow "Build ulang semua images..."
        Invoke-Compose "build"
        Write-Green "Build selesai."
    }

    "health" {
        Write-Cyan "Health Check semua service:"
        $checks = @(
            @{ name = "API Gateway  :8080"; url = "http://localhost:8080/health" },
            @{ name = "Auth Service :8081"; url = "http://localhost:8081/health" },
            @{ name = "Admin Svc    :3001"; url = "http://localhost:3001/health" },
            @{ name = "Order Svc    :8083"; url = "http://localhost:8083/health" }
        )
        foreach ($c in $checks) {
            try {
                $r = Invoke-WebRequest -Uri $c.url -TimeoutSec 3 -ErrorAction Stop
                Write-Green "  OK   $($c.name) - HTTP $($r.StatusCode)"
            } catch {
                Write-Red "  FAIL $($c.name) - tidak aktif"
            }
        }
    }

    default {
        Write-Cyan ""
        Write-Cyan "LANCAR - Docker Helper Script"
        Write-Host ""
        Write-Host "Penggunaan: powershell -ExecutionPolicy Bypass -File lancar.ps1 [command]"
        Write-Host ""
        Write-Host "  up         Jalankan semua backend service"
        Write-Host "  down       Stop semua service (data aman)"
        Write-Host "  reset      Stop + hapus semua data (hati-hati!)"
        Write-Host "  migrate    Jalankan migrasi database saja"
        Write-Host "  logs       Lihat semua logs (tambah nama service: logs api-gateway)"
        Write-Host "  status     Status semua container"
        Write-Host "  frontend   Jalankan frontend Next.js dev server"
        Write-Host "  build      Build ulang semua Docker images"
        Write-Host "  health     Health check semua HTTP endpoint"
        Write-Host ""
    }
}
