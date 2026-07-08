# Database Maintenance — Panduan VPS

Panduan lengkap untuk menjaga kesehatan `tembus-db` (PostgreSQL 15 + PostGIS) saat deployment di VPS.

---

## Arsitektur Koneksi (Setelah Optimasi)

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ auth-service │   │order-service │   │admin-service │   ... (6 services)
│  :8081       │   │  :8083       │   │  :3000       │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │ port 6432 (PgBouncer)
                   ┌──────▼───────┐
                   │  PgBouncer   │  Transaction Pooling
                   │ pool size=80 │  max_client_conn=2000
                   └──────┬───────┘
                          │ port 5432 (max 100 koneksi)
                   ┌──────▼───────┐
                   │  PostgreSQL  │  shared_buffers=2GB
                   │     15       │  effective_cache=6GB
                   └──────────────┘
```

**Manfaat vs sebelumnya:**
| Metrik | Sebelum | Sesudah |
|--------|---------|---------|
| Koneksi raw ke PG | ~120 | ~20-30 |
| RAM untuk koneksi | ~1.2 GB | ~200-300 MB |
| RAM cache PostgreSQL | 128 MB (default) | 2 GB |
| Waktu query rata-rata | Tinggi | Berkurang signifikan |

---

## Setup Awal di VPS

### 1. Clone dan deploy
```bash
cd /opt/tembus
git pull origin staging
docker compose up -d
```

### 2. Jalankan migrasi database
```bash
# Jalankan semua migrasi termasuk partisi & retention policies
docker compose --profile migrate run --rm migrate
```

### 3. Verifikasi PgBouncer aktif
```bash
# Cek status container
docker ps | grep pgbouncer

# Test koneksi via PgBouncer
docker exec tembus-pgbouncer pg_isready -h localhost -p 6432

# Lihat koneksi aktif
docker exec tembus-db psql -U postgres -d tembus \
  -c "SELECT count(*), state FROM pg_stat_activity WHERE datname='tembus' GROUP BY state;"
```

### 4. Verifikasi partisi courier_locations
```bash
docker exec tembus-db psql -U postgres -d tembus \
  -c "\d+ courier_locations"

# Output yang diharapkan:
# Partitions: courier_locations_2026_05, courier_locations_2026_06,
#             courier_locations_2026_07, ..., courier_locations_default
```

### 5. Test fungsi monitoring
```bash
docker exec tembus-db psql -U postgres -d tembus \
  -c "SELECT * FROM tembus_storage_stats();"
```

---

## Setup Cron Maintenance di VPS

### Salin script ke VPS
```bash
# Di VPS
mkdir -p /opt/tembus/scripts
cp /opt/tembus/scripts/db-maintenance.sh /opt/tembus/scripts/
chmod +x /opt/tembus/scripts/db-maintenance.sh
```

### Tambahkan ke crontab
```bash
crontab -e
```

Tambahkan baris berikut:
```cron
# Tembus DB Maintenance — Setiap tanggal 1, jam 02:00 WIB (19:00 UTC)
0 19 1 * * /opt/tembus/scripts/db-maintenance.sh >> /var/log/tembus-db-maintenance.log 2>&1

# Opsional: Buat partisi tiap minggu sebagai extra safety (Senin jam 01:00 WIB = Minggu 18:00 UTC)
0 18 * * 0 docker exec tembus-db psql -U postgres -d tembus -c "SELECT * FROM tembus_create_monthly_partitions(3);" >> /var/log/tembus-partition.log 2>&1
```

### Buat file log
```bash
touch /var/log/tembus-db-maintenance.log
chmod 644 /var/log/tembus-db-maintenance.log
```

---

## Perintah Monitoring Manual

### Cek ukuran tabel (jalankan kapanpun untuk monitoring)
```bash
docker exec tembus-db psql -U postgres -d tembus \
  -c "SELECT * FROM tembus_storage_stats();"
```

### Preview data yang akan dihapus (dry run)
```bash
# Via script
DRY_RUN=true /opt/tembus/scripts/db-maintenance.sh

# Atau langsung via psql
docker exec tembus-db psql -U postgres -d tembus \
  -c "SELECT * FROM tembus_cleanup_old_data(dry_run := TRUE);"
```

### Cek status partisi courier_locations
```bash
docker exec tembus-db psql -U postgres -d tembus -c "
SELECT
    child.relname AS partition_name,
    pg_get_expr(child.relpartbound, child.oid) AS partition_range,
    pg_size_pretty(pg_relation_size(child.oid)) AS size
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
WHERE parent.relname = 'courier_locations'
ORDER BY child.relname;
"
```

### Buat partisi untuk bulan tertentu secara manual
```bash
docker exec tembus-db psql -U postgres -d tembus \
  -c "SELECT * FROM tembus_create_monthly_partitions(6);"
```

### Cek disk usage VPS secara keseluruhan
```bash
# Total disk VPS
df -h /

# Ukuran volume Docker PostgreSQL
docker system df -v | grep tembus-db-data
```

---

## Troubleshooting

### Error: "no partition of relation courier_locations found for row"
Partisi bulan ini belum dibuat. Solusi:
```bash
docker exec tembus-db psql -U postgres -d tembus \
  -c "SELECT * FROM tembus_create_monthly_partitions(3);"
```

### Error: "too many connections" di PostgreSQL
PgBouncer mungkin tidak aktif. Cek:
```bash
docker ps | grep pgbouncer
docker logs tembus-pgbouncer --tail 50

# Restart jika perlu
docker compose restart pgbouncer
```

### Disk VPS hampir penuh (>80%)
Jalankan cleanup darurat:
```bash
# Preview dulu
DRY_RUN=true /opt/tembus/scripts/db-maintenance.sh

# Jika preview ok, eksekusi
/opt/tembus/scripts/db-maintenance.sh
```

### PostgreSQL lambat setelah cleanup
Perlu VACUUM ANALYZE:
```bash
docker exec tembus-db psql -U postgres -d tembus \
  -c "VACUUM ANALYZE;"
```

---

## Konfigurasi Tuning PostgreSQL

File tuning ada di: [database/postgres-tuning.conf](../database/postgres-tuning.conf)

### Jika RAM VPS bukan 8GB, sesuaikan nilai ini:

| RAM VPS | shared_buffers | effective_cache_size | work_mem |
|---------|---------------|---------------------|----------|
| 4 GB    | 1GB           | 3GB                 | 8MB      |
| 8 GB    | 2GB           | 6GB                 | 16MB     |
| 16 GB   | 4GB           | 12GB                | 32MB     |
| 32 GB   | 8GB           | 24GB                | 64MB     |

Setelah mengubah `postgres-tuning.conf`, restart container PostgreSQL:
```bash
docker compose restart db
```

---

## Kebijakan Retensi Data

| Tabel | Retensi | Alasan |
|-------|---------|--------|
| `courier_locations` | 2 bulan (via DROP PARTITION) | Data GPS mentah, volume sangat besar |
| `courier_gps_logs` (VALID) | 30 hari | GPS normal tidak butuh histori panjang |
| `courier_gps_logs` (SUSPECT/FAKE) | 90 hari | Butuh lebih lama untuk forensik |
| `audit_logs` | 365 hari | Kepatuhan audit 1 tahun |
| `sla_logs` | 180 hari | Analisis performa kurir 6 bulan |
| `weather_logs` | 7 hari | Hanya dipakai untuk surge pricing real-time |
| `notifications` (dibaca) | 30 hari | Inbox sudah tidak relevan |
| `notifications` (belum dibaca) | 90 hari | Buffer lebih panjang |
| `package_scans` | 90 hari | Bukti scan paket per order |
