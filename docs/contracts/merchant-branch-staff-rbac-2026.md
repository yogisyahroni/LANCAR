# Merchant Branch + Staff/Device RBAC Contract (2026)

`merchant-service` owns merchant branches, staff branch assignments, merchant device sessions, and high-risk merchant security approvals. Other services must authorize an actor through this contract instead of trusting a merchant or branch identifier from the client.

## Roles and permissions

- `owner` is the merchant owner (`merchants.user_id`) and is not stored as a staff row.
- Staff roles are `manager`, `kitchen`, `cashier`, `marketing`, and `finance`.
- `kasir` remains an input compatibility alias and is normalized to `cashier`.
- Staff permissions are derived server-side from the role; clients cannot submit an arbitrary permission bitmask.

## Branch and session scope

- Branches are unique by `(merchant_id, code)`.
- A staff member receives explicit rows in `merchant_staff_branch_access`.
- A device session is bound to `(user_id, merchant_id, branch_id, device_id)` and stores only a SHA-256 session-token hash.
- Staff operational requests must send `X-Merchant-Session-Token`, `X-Merchant-Branch-ID`, and `X-Device-ID`. The server re-checks expiry, active branch, staff status, branch assignment, and the required permission on every request.
- Revoking staff or deactivating a branch revokes existing sessions in the same database transaction/trigger path. Authorization also checks current status, so read-replica lag cannot grant stale staff access when the service uses its authoritative DB.

## High-risk changes

- Bank account, payout, and payout-related merchant configuration changes require gateway-authenticated `X-TOTP-Verified: true`, an idempotency key, and an approved security approval.
- Approval requests are created by the merchant owner and approved by an independent `ops_security`, `ops_admin`, `finance_admin`, or `super_admin` actor with step-up authentication.
- The approval workflow rejects self-approval, expired approvals, wrong merchant scope, wrong change type, and missing approval references.

## Endpoints

- `POST/GET /api/v1/merchant/branches/{merchantID}`
- `PATCH /api/v1/merchant/branches/{merchantID}/{branchID}`
- `GET/PUT /api/v1/merchant/branches/{merchantID}/staff/{staffID}`
- `POST /api/v1/merchant/device-sessions/{merchantID}`
- `DELETE /api/v1/merchant/device-sessions/{merchantID}/{sessionID}`
- `POST /api/v1/merchant/security-approvals/{merchantID}`
- `POST /api/v1/merchant/security-approvals/{merchantID}/{approvalID}/approve`

The raw device session token is returned only when the session is created and must not be logged or persisted by clients in plaintext outside secure device storage.
