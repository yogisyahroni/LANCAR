# ================================================================
# lancar.ps1 - Script helper Lancar untuk Podman Desktop (WSL mode)
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
$WSL_DISTRO = "podman-machine-default"

# Tambah Podman ke PATH sesi ini
if ($env:PATH -notlike "*Programs\Podman*") {
    $env:PATH += ";$env:LOCALAPPDATA\Programs\Podman"
}

# Konversi path Windows ke WSL path (pakai wslpath agar spasi aman)
function Get-WslPath {
    param([string]$WinPath)
    # Pakai wslpath langsung dari WSL untuk konversi yang akurat
    $result = wsl -d $WSL_DISTRO -- wslpath -a ($WinPath.Replace("\", "/")) 2>$null
    if ($LASTEXITCODE -eq 0 -and $result) {
        return $result.Trim()
    }
    # Fallback manual
    $clean = $WinPath.Replace("\", "/")
    $drive = $clean.Substring(0, 1).ToLower()
    $rest  = $clean.Substring(2) -replace ' ', '\ '
    return "/mnt/$drive$rest"
}

$PROJECT_DIR_WIN = (Get-Location).Path
# Gunakan wslpath untuk escape path dengan spasi
$PROJECT_DIR_WSL = wsl -d $WSL_DISTRO -- wslpath -a ($PROJECT_DIR_WIN.Replace("\", "/")) 2>$null
if (-not $PROJECT_DIR_WSL) {
    $d = $PROJECT_DIR_WIN.Substring(0,1).ToLower()
    $r = $PROJECT_DIR_WIN.Substring(2).Replace("\", "/")
    $PROJECT_DIR_WSL = "/mnt/$d$r"
}
$PROJECT_DIR_WSL = $PROJECT_DIR_WSL.Trim()

# Jalankan podman compose via WSL — path dibungkus single quote agar spasi aman
function Invoke-Compose {
    param([string]$Arguments)
    # bash single quotes melindungi spasi di path
    $escaped = $PROJECT_DIR_WSL -replace "'", "'\"'\"'"
    wsl -d $WSL_DISTRO -- bash -c "cd '$escaped' && podman compose $Arguments"
}

# Cek apakah WSL machine sudah running
function Assert-MachineRunning {
    $raw = wsl --list --running 2>&1 | Out-String
    # wsl output berisi null bytes, bersihkan
    $clean = $raw -replace "`0", ""
    if ($clean -notmatch $WSL_DISTRO) {
        Write-Yellow "Podman machine belum running. Mencoba start..."
        wsl -d $WSL_DISTRO -- bash -c "exit 0" 2>$null
        Start-Sleep -Seconds 5
        $raw2  = wsl --list --running 2>&1 | Out-String
        $clean2 = $raw2 -replace "`0", ""
        if ($clean2 -notmatch $WSL_DISTRO) {
            Write-Red "GAGAL: Podman machine tidak bisa start."
            Write-Yellow "Buka Podman Desktop dan klik tombol Start pada machine."
            exit 1
        }
    }
    Write-Green "OK: Podman machine running."
}

# Cek .env
function Ensure-EnvFile {
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Yellow "File .env dibuat dari .env.example."
            Write-Yellow "Edit .env dan isi JWT_SECRET (minimal 32 karakter)!"
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
        Write-Cyan "=== Menjalankan Lancar Backend Stack dengan Podman ==="
        Assert-MachineRunning
        Ensure-EnvFile

        Write-Yellow ""
        Write-Yellow "[1/4] Memulai Database dan Redis..."
        Invoke-Compose "up -d db redis"

        Write-Yellow ""
        Write-Yellow "[2/4] Menunggu database sehat (maks 60 detik)..."
        $dbReady = $false
        for ($i = 1; $i -le 20; $i++) {
            $escaped = $PROJECT_DIR_WSL -replace "'", "'\"'\"'"
            $out = wsl -d $WSL_DISTRO -- bash -c "cd '$escaped' && podman compose ps db" 2>&1 | Out-String
            if ($out -match "healthy") {
                Write-Green "   Database siap!"
                $dbReady = $true
                break
            }
            Write-Yellow "   Percobaan $i/20 - menunggu 3 detik..."
            Start-Sleep -Seconds 3
        }
        if (-not $dbReady) {
            Write-Yellow "   Timeout health check, melanjutkan..."
        }

        Write-Yellow ""
        Write-Yellow "[3/4] Menjalankan migrasi database..."
        Invoke-Compose "--profile migrate up migrate"

        Write-Yellow ""
        Write-Yellow "[4/4] Memulai semua backend service..."
        Invoke-Compose "up -d auth-service admin-service order-service routing-service api-gateway rabbitmq"

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
        Assert-MachineRunning
        Invoke-Compose "down"
        Write-Green "Semua service dihentikan. Data volume tetap aman."
    }

    "reset" {
        Write-Red ""
        Write-Red "PERINGATAN: Reset akan MENGHAPUS semua data database!"
        $confirm = Read-Host "Ketik 'ya' untuk konfirmasi"
        if ($confirm -eq "ya") {
            Assert-MachineRunning
            Write-Yellow "Menghapus semua container dan volume..."
            Invoke-Compose "down -v"
            Write-Green "Reset selesai. Jalankan 'up' untuk mulai ulang."
        } else {
            Write-Yellow "Reset dibatalkan."
        }
    }

    "migrate" {
        Write-Yellow "Menjalankan migrasi database..."
        Assert-MachineRunning
        Invoke-Compose "--profile migrate up migrate"
        Write-Green "Migrasi selesai."
    }

    "logs" {
        $svc = if ($args.Count -gt 1) { $args[1] } else { "" }
        Assert-MachineRunning
        Write-Cyan "Menampilkan logs $svc (Ctrl+C untuk berhenti)..."
        Invoke-Compose "logs -f --tail=150 $svc"
    }

    "status" {
        Assert-MachineRunning
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
        Assert-MachineRunning
        Invoke-Compose "build --parallel"
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
        Write-Cyan "LANCAR - Podman Helper Script"
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
