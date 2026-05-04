# ================================================================
# lancar.ps1 — Script helper untuk Podman Desktop di Windows
# 
# CARA PAKAI:
#   .\lancar.ps1 up        → Jalankan semua service
#   .\lancar.ps1 down      → Stop semua service
#   .\lancar.ps1 reset     → Reset termasuk hapus volume DB
#   .\lancar.ps1 migrate   → Jalankan migrasi database
#   .\lancar.ps1 logs      → Lihat semua logs
#   .\lancar.ps1 status    → Status semua container
#   .\lancar.ps1 frontend  → Jalankan frontend (Next.js dev server)
# ================================================================

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

# ── Warna output ─────────────────────────────────────────────
function Write-Green  { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Yellow { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Red    { param($msg) Write-Host $msg -ForegroundColor Red }
function Write-Cyan   { param($msg) Write-Host $msg -ForegroundColor Cyan }

# ── Deteksi podman atau docker ────────────────────────────────
function Get-ComposeTool {
    # Podman Compose (python-based, atau bawaan Podman Desktop)
    if (Get-Command "podman" -ErrorAction SilentlyContinue) {
        # Cek versi podman agar bisa pakai 'podman compose'
        $version = (podman --version 2>$null) -replace '[^0-9.]', ''
        $major = [int]($version.Split('.')[0])
        if ($major -ge 4) {
            Write-Cyan "🦭 Menggunakan: Podman Compose (podman compose)"
            return "podman compose"
        }
    }
    if (Get-Command "podman-compose" -ErrorAction SilentlyContinue) {
        Write-Cyan "🦭 Menggunakan: podman-compose"
        return "podman-compose"
    }
    if (Get-Command "docker" -ErrorAction SilentlyContinue) {
        Write-Cyan "🐳 Menggunakan: Docker Compose"
        return "docker compose"
    }
    Write-Red "❌ ERROR: Tidak ditemukan podman atau docker di PATH!"
    Write-Yellow "   Install Podman Desktop dari: https://podman-desktop.io"
    exit 1
}

$ComposeTool = Get-ComposeTool
$ComposeFiles = "-f docker-compose.yml"

# ── Cek .env file ─────────────────────────────────────────────
function Ensure-EnvFile {
    if (-not (Test-Path ".env")) {
        Write-Yellow "⚠️  File .env tidak ditemukan. Membuat dari .env.example..."
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Green "✅ .env dibuat dari .env.example"
            Write-Yellow "   Edit .env dan isi JWT_SECRET, GOOGLE_MAPS_API_KEY, dll."
        } else {
            Write-Red "❌ .env.example tidak ditemukan! Buat .env manual."
            exit 1
        }
    }
}

# ── Commands ──────────────────────────────────────────────────
switch ($Command.ToLower()) {

    "up" {
        Write-Cyan "`n🚀 Menjalankan Lancar Backend Stack..."
        Ensure-EnvFile

        # Jalankan DB + Redis dulu
        Write-Yellow "`n[1/4] Starting database & cache..."
        Invoke-Expression "$ComposeTool $ComposeFiles up -d db redis"

        # Tunggu DB sehat
        Write-Yellow "`n[2/4] Menunggu database siap..."
        $maxRetry = 20
        for ($i = 1; $i -le $maxRetry; $i++) {
            $status = Invoke-Expression "$ComposeTool $ComposeFiles ps db" 2>$null
            if ($status -match "healthy") {
                Write-Green "   ✅ Database siap!"
                break
            }
            Write-Yellow "   Attempt $i/$maxRetry - tunggu 3 detik..."
            Start-Sleep -Seconds 3
        }

        # Jalankan migrasi
        Write-Yellow "`n[3/4] Menjalankan migrasi database..."
        Invoke-Expression "$ComposeTool $ComposeFiles --profile migrate up migrate"

        # Jalankan semua service
        Write-Yellow "`n[4/4] Starting semua service..."
        Invoke-Expression "$ComposeTool $ComposeFiles up -d auth-service admin-service order-service routing-service api-gateway rabbitmq"

        Write-Green "`n✅ Semua service berjalan!"
        Write-Cyan "`n📍 Endpoint:"
        Write-Host "   🌐 API Gateway   : http://localhost:8080"
        Write-Host "   🔐 Auth Service  : http://localhost:8081"
        Write-Host "   👤 Admin Service : http://localhost:3001"
        Write-Host "   📦 Order Service : http://localhost:8083"
        Write-Host "   🗺️  Routing       : http://localhost:8082"
        Write-Host "   🐇 RabbitMQ UI  : http://localhost:15672"
        Write-Host "   🗄️  PostgreSQL    : localhost:5432"
        Write-Host "   📮 Redis         : localhost:6379"
        Write-Cyan "`n💡 Jalankan frontend: .\lancar.ps1 frontend"
        Write-Cyan "   Lihat logs:         .\lancar.ps1 logs"
    }

    "down" {
        Write-Yellow "⏹️  Menghentikan semua service..."
        Invoke-Expression "$ComposeTool $ComposeFiles down"
        Write-Green "✅ Semua service dihentikan. Volume DB aman."
    }

    "reset" {
        Write-Red "`n⚠️  RESET akan menghapus semua data database!"
        $confirm = Read-Host "Ketik 'ya' untuk konfirmasi"
        if ($confirm -eq "ya") {
            Write-Yellow "🗑️  Menghapus container dan volume..."
            Invoke-Expression "$ComposeTool $ComposeFiles down -v"
            Write-Green "✅ Reset selesai. Jalankan '.\lancar.ps1 up' untuk mulai ulang."
        } else {
            Write-Yellow "❌ Reset dibatalkan."
        }
    }

    "migrate" {
        Write-Yellow "🗃️  Menjalankan migrasi database..."
        Invoke-Expression "$ComposeTool $ComposeFiles --profile migrate up migrate"
        Write-Green "✅ Migrasi selesai."
    }

    "logs" {
        $service = if ($args[0]) { $args[0] } else { "" }
        Invoke-Expression "$ComposeTool $ComposeFiles logs -f --tail=100 $service"
    }

    "status" {
        Write-Cyan "📊 Status Container Lancar:"
        Invoke-Expression "$ComposeTool $ComposeFiles ps"
    }

    "frontend" {
        Write-Cyan "🖥️  Menjalankan Frontend (Next.js Dev Server)..."
        Set-Location "frontend"
        
        # Set env untuk connect ke gateway lokal
        $env:NEXT_PUBLIC_API_URL = "http://localhost:8080/api/v1"
        
        Write-Green "✅ Frontend akan buka di: http://localhost:3000"
        Write-Yellow "   API terhubung ke Gateway: http://localhost:8080"
        npm run dev
    }

    "build" {
        Write-Yellow "🔨 Build semua Docker/Podman images..."
        Invoke-Expression "$ComposeTool $ComposeFiles build --parallel"
        Write-Green "✅ Build selesai."
    }

    "pull" {
        Write-Yellow "📥 Pull image terbaru dari registry..."
        Invoke-Expression "$ComposeTool $ComposeFiles pull"
        Write-Green "✅ Pull selesai."
    }

    "health" {
        Write-Cyan "🏥 Health Check semua service:"
        $services = @("http://localhost:8080/health", "http://localhost:8081/health", "http://localhost:3001/health", "http://localhost:8083/health")
        $names = @("API Gateway :8080", "Auth Service :8081", "Admin Service :3001", "Order Service :8083")
        for ($i = 0; $i -lt $services.Length; $i++) {
            try {
                $resp = Invoke-WebRequest -Uri $services[$i] -TimeoutSec 3 -ErrorAction Stop
                Write-Green "   ✅ $($names[$i]) — OK ($($resp.StatusCode))"
            } catch {
                Write-Red "   ❌ $($names[$i]) — GAGAL"
            }
        }
    }

    default {
        Write-Cyan "`n🦭 LANCAR — Podman/Docker Helper Script"
        Write-Host "`nPenggunaan:"
        Write-Host "  .\lancar.ps1 up        → Jalankan semua backend service"
        Write-Host "  .\lancar.ps1 down      → Stop semua service (data aman)"
        Write-Host "  .\lancar.ps1 reset     → Stop + hapus semua data (⚠️ hati-hati!)"
        Write-Host "  .\lancar.ps1 migrate   → Jalankan migrasi DB saja"
        Write-Host "  .\lancar.ps1 logs      → Lihat semua logs (Ctrl+C untuk berhenti)"
        Write-Host "  .\lancar.ps1 logs api-gateway → Logs service spesifik"
        Write-Host "  .\lancar.ps1 status    → Lihat status semua container"
        Write-Host "  .\lancar.ps1 frontend  → Jalankan frontend Next.js"
        Write-Host "  .\lancar.ps1 build     → Build ulang semua images"
        Write-Host "  .\lancar.ps1 health    → Health check semua endpoint"
        Write-Host ""
    }
}
