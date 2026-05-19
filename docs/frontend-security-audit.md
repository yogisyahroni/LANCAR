# Frontend Dependency Security Audit

**Scope:** `frontend` customer web application plus bulk-upload dependency touchpoint in `backend/admin-service`  
**Last updated:** 2026-05-19  
**Command:** `npm audit --audit-level=moderate`

## Result

`frontend` and `backend/admin-service` now report **0 vulnerabilities** at moderate-or-higher audit level.

## Changes Applied

| Area | Previous Risk | Action | Residual Risk |
|---|---|---|---|
| Next.js | High severity advisories on `next@16.2.4` | Upgraded to `next@16.2.6` and `eslint-config-next@16.2.6` | None reported by audit |
| Browser spreadsheet parsing | High severity advisories on `xlsx@0.18.5`; no patched npm release available | Removed `xlsx` from frontend runtime and replaced browser import/export with CSV utilities | CSV import is text-only and bounded by UI file-size limits |
| Bulk order upload compatibility | XLSX parsing would require the vulnerable SheetJS package | CSV is now the official bulk upload format; server rejects XLSX with a clear error | Operators should distribute only the official CSV template |
| Admin-service transitive advisories | `ws` and `@tootallnate/once` transitive advisories from realtime/Firebase dependencies | Added npm overrides to patched versions | None reported by audit |
| `brace-expansion` | Moderate transitive DoS advisory | Ran `npm audit fix` | None reported by audit |
| `ws` via `socket.io-client` | Moderate transitive advisory | Added npm override to `ws@8.20.1` | None reported by audit |
| `postcss` via Next.js | Moderate transitive advisory | Added npm override to `postcss@8.5.10` | None reported by audit |

## Operational Controls

- Keep `npm audit --audit-level=high` blocking CI for production builds.
- Keep `npm audit --audit-level=moderate` as a release gate for customer web.
- Do not reintroduce browser-side or server-side `xlsx` until SheetJS publishes a patched npm release or the import path is isolated in a sandboxed document-processing worker with file scanning and strict workbook limits.
- Spreadsheet uploads for bulk orders use CSV as the official supported format.

## Verification

```powershell
cd frontend
npm audit --audit-level=moderate
npm run build
npm test -- --runInBand

cd ../backend/admin-service
npm audit --audit-level=moderate
npm run build
npm test -- --runInBand
```
