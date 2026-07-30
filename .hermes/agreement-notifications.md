## ADR: Admin Notification for New Agreements

**Status**: ✅ Implemented
**Date**: 30 Jul 2026

### Problem
Admin perlu tau secara real-time kalo ada user baru yang menandatangani perjanjian.

### Architecture
Gua pake **Redis pub/sub** buat notifikasi real-time dari Go auth-service ke TypeScript admin-service WebSocket:

```
Go auth-service                    TypeScript admin-service
     │                                      │
     ├─ DB insert ke `notifications` ──────► REST GET /auth/web/notifications
     │                                      │
     └─ Redis PUB ─────────────────────────► Redis SUB → WebSocket emit
         channel: "tembus:notification:new"      │
                                                  └─ io.emit('new_notification')
                                                       ↓
                                                  Admin Dashboard (socket.io client)
```

### Files Changed (4)

| File | Change |
|------|--------|
| `domain/agreement.go` | Tambah `InsertAdminNotification` ke interface |
| `repository/agreement_repo.go` | `GetAdminUserIDs()` + `InsertAdminNotification()` — query admin users, insert ke notifications |
| `service/agreement_service.go` | `SetRedisClient()` + `notifyAdmins()` — panggil repo method + Redis Publish |
| `cmd/api/main.go` | `rdb` diteruskan ke agreementSvc via SetRedisClient |
| `admin-service/src/websocket.ts` | Subscribe `tembus:notification:new` → broadcast `new_notification` ke semua admin via io.emit() |

### Build Status
- `go build ./cmd/api/...` ✅
- `tsc --noEmit` (admin-service) ✅
- `tsc --noEmit` (admin-dashboard) ✅
