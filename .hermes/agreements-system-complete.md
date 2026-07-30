## ✅ Agreements System — End-to-End Complete

**Scope**: End-to-end agreement/legal document system — mobile → backend → admin dashboard
**Status**: ✅ Fully implemented and compiled (Go + TypeScript)

### 🔄 Data Flow

1. **Mobile App**: User centang checkbox → `agreed_to_terms: true` → API kirim flag
2. **Backend**: `POST /api/v1/auth/agreements/accept` →
   - Generate HTML agreement dari **Go template** (isi dinamis: NIK, nama, tanggal)
   - Simpan ke `agreements/{user_type}/{user_id}/` via StorageService
   - Buat record di DB `agreements` table
3. **Admin Dashboard**: GET `/api/v1/admin/agreements` → tabel + filter + detail modal
4. **View/Download/Print**: `/api/v1/admin/agreements/{id}/pdf` → iframe atau browser print

### 📂 Files Changed (13 total)

**Frontend Mobile (6)**:
- `CourierRegistration.kt` — request model + field
- `CourierRegistrationViewModel.kt` — state + validation
- `CourierRegistrationScreen.kt` — checkbox UI
- `CustomerModels.kt` — UpdateProfileRequest
- `AuthViewModel.kt` — agreedToTerms state
- `CompleteProfileScreen.kt` — checkbox UI

**Database (1)**:
- `00011_agreements.sql` — agreements table + agreed_to_terms on users

**Backend Go (5)**:
- `domain/agreement.go` — model + interface
- `repository/agreement_repo.go` — Postgres implementation
- `service/agreement_service.go` — logic + HTML templates + PDF gen
- `admin_agreement_handler.go` — 5 endpoints
- `cmd/api/main.go` — routes registration

**Admin Dashboard (3)**:
- `Agreements.tsx` — tabel + filter + detail modal + PDF iframe viewer
- `App.tsx` — route `/agreements`
- `DashboardLayout.tsx` — sidebar item "Perjanjian Hukum"

### 📡 API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/agreements/accept` | User | Create agreement (mobile) |
| GET | `/api/v1/auth/agreements/mine` | User | My agreements |
| GET | `/api/v1/admin/agreements` | Admin | List + filters |
| GET | `/api/v1/admin/agreements/{id}` | Admin | Detail |
| GET | `/api/v1/admin/agreements/{id}/pdf` | Admin | View/Print/Download |

### 📝 Agreement Templates
- **Perjanjian Mitra Kurir** — NIK, pasal hukum, larangan pidana (mitra_agreement)
- **Syarat & Ketentuan Pelanggan** — daftar barang terlarang (customer_tos)
- All fields NIK/nama/tanggal **dinamis dari data user**, user hanya perlu centang

### ✅ Build Status
- `go build ./cmd/api/...` ✅
- `npx tsc --noEmit` ✅ (admin-dashboard)
