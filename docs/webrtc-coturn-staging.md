# WebRTC Coturn Staging Runbook

## Tujuan

Voice call in-app TEMBUS memakai WebRTC self-hosted. Signaling tetap lewat backend/socket, sedangkan coturn dipakai sebagai fallback ketika peer-to-peer gagal karena NAT, jaringan mobile, atau firewall.

## Environment Backend

Isi di host staging/production, bukan di repository:

```bash
STUN_URLS=stun:turn.tembus.example:3478
TURN_URLS=turns:turn.tembus.example:5349?transport=tcp,turn:turn.tembus.example:3478?transport=udp
COTURN_STATIC_AUTH_SECRET=<32-bytes-minimum-random-secret>
```

Alternatif sementara jika belum memakai shared secret:

```bash
TURN_URLS=turns:turn.tembus.example:5349?transport=tcp,turn:turn.tembus.example:3478?transport=udp
COTURN_STATIC_USERNAME=<temporary-user>
COTURN_STATIC_PASSWORD=<temporary-password>
```

Shared secret lebih aman karena backend membuat username/password TURN short-lived. Secret tidak boleh dikirim ke mobile, web, log, artifact CI, atau chat.

## Deploy Coturn

1. Siapkan DNS publik, misalnya `turn.tembus.example`.
2. Pasang sertifikat TLS valid untuk domain tersebut.
3. Buka firewall:
   - TCP/UDP `3478`
   - TCP `5349`
   - UDP relay range `49160-49260`
4. Jalankan:

```bash
docker compose -f deploy/coturn/docker-compose.coturn.yml up -d
```

5. Restart backend hanya jika env baru belum terbaca proses. Setelah env tersedia, credential TURN yang diterima mobile tetap short-lived dari backend.

## Smoke Test

1. Login customer app di device/emulator A.
2. Login courier app di device/emulator B.
3. Pastikan order assigned.
4. Customer mulai panggilan ke kurir.
5. Kurir menerima panggilan.
6. Matikan Wi-Fi salah satu device dan ulangi memakai jaringan mobile/hotspot untuk memastikan TURN fallback bekerja.

Jangan screenshot token, TURN username/password, SDP, ICE candidate, atau raw socket payload.

## Monitoring Minimum

Pantau:

- `communication_call_started`
- `communication_call_accepted`
- `communication_call_closed`
- `communication_wrong_target_prevented`
- bandwidth coturn
- error rate coturn
- CPU/memory coturn

Alert awal:

- call accepted rate turun tajam.
- TURN bandwidth mendadak naik.
- socket authorization denied spike.
