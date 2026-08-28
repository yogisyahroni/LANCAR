# Customer Web (frontend/) — Design & Flow Audit

Audit tanggal: 2026-08-27
Lensa: Anthropic `frontend-design` + `ui-ux-pro-max` (design-system) + WCAG
Status build: dev server jalan `npm run dev` (localhost:3000). Login = Google SSO (block screenshot).

## A. TEMUAN DESIGN (pending merge/fix)

### A1 [BUG] Login bg glow pakai warna non-brand
- File: `src/app/(auth)/login/page.tsx:241`
- `bg-blue-500/10` → harus `bg-primary/10` atau `bg-accent/10`
- Dampak: glow biru rusak kohesi brand (primary=#003A20 green, accent=#F97316 orange)

### A2 [BUG] Hardcode warna di ekspedisi dashboard (langgar design-system skill)
- File: `src/app/(portal)/dashboard/page.tsx:264-293`
- `text-emerald-500`, `bg-emerald-500/10`, `text-blue-500`, `text-rose-500`
- Harus: `text-success`, `text-info`, `text-error` (token semantic sudah ada di globals.css)
- Aturan: NEVER hardcode raw color — pakai token.

### A3 [BUG] Demo data statis di ekspedisi cards (deceiving)
- File: `src/app/(portal)/dashboard/page.tsx:249,262,275` ("715 Order", "Rp18.500.000", "12 Paket")
- Hardcode, bukan dari API. Lawan prinsip honest empty/error state.
- Fix: ambil dari `dashboardStats` atau render zero/empty state jujur.

## B. TEMUAN FLOW (lihat file analisa-flow.md)
- pending

## C. TEMUAN DUPLIKASI FUNGSI (lihat file analisa-flow.md)
- pending

## Prioritas fix
1. A2 (token consistency — cepat, high impact)
2. A3 (honesty/data integrity)
3. A1 (cosmetic brand cohesion)

## Verdict awal
Foundation design system KUAT & on-brand (token 3-layer, glass-card signature, WCAG floor).
Skor sementara 8/10. Tunggu hasil analisa flow + duplikasi sebelum final.
