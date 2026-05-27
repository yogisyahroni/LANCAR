# Mobile Smoke Test Checklist

Status: Ready for device execution
Last updated: 2026-05-26
Scope: TEMBUS Courier Android app and TEMBUS Customer Android app

Use this checklist for every internal testing release before promoting to wider testing or production. Run tests from a Google Play internal testing install whenever possible, not from a side-loaded debug APK.

## Test Session Header

Copy this block for every test session.

```text
App:
Package:
Version name:
Version code:
Build source: Google Play internal testing / CI artifact / local release
Tester:
Device model:
Android version:
Network: Wi-Fi / cellular / both
Test date:
Backend environment:
OTP feature flag state:
Result: PASS / FAIL / BLOCKED
```

## Pass/Fail Rules

- PASS: The flow completes and the observed behavior matches expected behavior.
- FAIL: The flow breaks, crashes, loses data, exposes sensitive data, or hits the wrong backend.
- BLOCKED: The flow cannot be tested because an external dependency is unavailable.
- N/A: The feature is not enabled for that app or that environment.

Every FAIL must include:

- Screenshot or screen recording if allowed.
- Timestamp.
- Test account.
- App version code.
- Backend request ID or order ID if available.
- Logcat snippet if the app crashes.

## Courier Smoke Checklist

| ID | Area | Steps | Expected result | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| C-01 | Install | Install from Google Play internal test link. | App installs as `TEMBUS Courier`; package is `com.tembus.courier`. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-02 | First launch | Open app from launcher. | App launches without crash, blank screen, or Firebase init error. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-03 | Login invalid | Login with invalid phone/password or invalid OTP state. | App rejects login with clear error and no crash. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-04 | Login valid | Login with courier test account. | Courier reaches authenticated home/order screen. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-05 | OTP flag | Test login when OTP is enabled or disabled by admin flag. | Behavior follows feature flag; development bypass does not affect production unless intentionally configured. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-06 | Token persistence | Close and reopen app after login. | Session remains valid when token is valid; no forced unexpected logout. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-07 | Token cleanup | Logout. Reopen app. | User is logged out and cannot access protected screens. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-08 | Notification permission | Grant notification permission when prompted. | Permission request is clear and app continues after grant. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-09 | FCM registration | Login and wait for token registration. | Backend receives FCM token for courier device. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-10 | Push notification | Send a test order/notification. | Notification appears and opens the relevant app area. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-11 | Location permission | Grant foreground location permission. | App records location permission without crash. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-12 | Background location | Enable tracking flow that requires background location. | App requests/uses background location only when operationally justified. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-13 | Map display | Open map/navigation screen. | Map renders, current/route location appears if permitted. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-14 | Order list | Open active/available order list. | Real backend orders load; no mock or placeholder order appears. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-15 | Accept order | Accept assigned/available test order. | Order status updates successfully and server reflects change. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-16 | Pickup flow | Complete pickup step. | Required validation works and status progresses. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-17 | Delivery proof | Capture/upload proof of delivery if required. | Camera/upload works; proof is visible in backend/admin flow. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-18 | Offline handling | Disable network during an allowed queued action. Restore network. | App degrades gracefully and syncs when online. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-19 | Payout screen | Open payout/wallet/bank surface. | Sensitive data is not leaked in logs; release screen blocks screenshot if configured. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-20 | Screenshot protection | Attempt screenshot on login/OTP/payout/profile sensitive screen in release build. | Screenshot/recent-app preview is blocked on protected screens. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-21 | Wrong backend guard | Confirm app version/backend label or request target through logs/backend. | Release app talks to intended API base URL. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| C-22 | Crash diagnostics | Trigger controlled internal-only crash if enabled. | Crash appears in diagnostics without secrets/PII in logs. | [ ] PASS [ ] FAIL [ ] BLOCKED | |

## Customer Smoke Checklist

| ID | Area | Steps | Expected result | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| U-01 | Install | Install from Google Play internal test link. | App installs as `TEMBUS Customer`; package is `com.tembus.customer`. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-02 | First launch | Open app from launcher. | App launches without crash, blank screen, or Firebase init error. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-03 | Register/login invalid | Use invalid account or OTP state. | App rejects request with clear error and no crash. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-04 | Register/login valid | Login or register with customer test account. | Customer reaches authenticated home/order screen. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-05 | OTP flag | Test login when OTP is enabled or disabled by admin flag. | Behavior follows feature flag; no unexpected production bypass. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-06 | Token persistence | Close and reopen app after login. | Session remains valid when token is valid. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-07 | Token cleanup | Logout. Reopen app. | User is logged out and protected screens require auth. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-08 | Notification permission | Grant notification permission when prompted. | Permission request is clear and app continues after grant. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-09 | FCM registration | Login and wait for token registration. | Backend receives FCM token for customer device. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-10 | Push notification | Send order status/test notification. | Notification appears and opens relevant order/status screen. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-11 | Location permission | Use address/map feature and grant permission. | Address/location flow works and denial is handled gracefully. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-12 | Background location review | Confirm whether background location is requested during normal customer flow. | Background location is not requested unless the product requirement justifies it. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-13 | Address selection | Select pickup and destination addresses. | Real map/address provider works; no hardcoded address fallback appears. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-14 | Price estimate | Request price/route estimate. | Real backend estimate loads; no mock pricing appears. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-15 | Create order | Create a test order. | Order is created in backend and visible to admin/ops. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-16 | Payment flow/status | Open payment or payment-status flow. | Payment status is real and no raw payment credential is exposed. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-17 | Order tracking | Track active order. | Status and courier/location updates appear correctly. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-18 | Deep link | Open supported order deep link if available. | App opens intended order route or safe fallback. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-19 | Offline handling | Disable network during safe browsing/order status screen. Restore network. | App degrades gracefully and refreshes when online. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-20 | Screenshot protection | Attempt screenshot on login/OTP/payment/profile sensitive screen in release build. | Screenshot/recent-app preview is blocked on protected screens. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-21 | Wrong backend guard | Confirm app version/backend label or request target through backend. | Release app talks to intended API base URL. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| U-22 | Crash diagnostics | Trigger controlled internal-only crash if enabled. | Crash appears in diagnostics without secrets/PII in logs. | [ ] PASS [ ] FAIL [ ] BLOCKED | |

## Cross-App Regression Checks

Run these once after Courier and Customer pass their main flows.

| ID | Check | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| X-01 | Courier and Customer installed on same device | Apps coexist without package conflict. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| X-02 | Notifications from both apps | Notification channels are distinct and correct. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| X-03 | Firebase apps | Courier uses Courier Firebase config; Customer uses Customer Firebase config. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| X-04 | Signing/version | Both apps have expected version code/name from CI. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| X-05 | Play update path | Updating from previous internal version works. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| X-06 | Privacy policy link | Play listing points to public privacy policy URL. | [ ] PASS [ ] FAIL [ ] BLOCKED | |

## Failure Report Template

```text
Issue ID:
App:
Version code:
Device:
Android version:
Tester:
Time:
Flow ID:
Severity: Blocker / High / Medium / Low
Expected:
Actual:
Reproduction steps:
Order ID / user ID / request ID:
Attachment path or link:
Owner:
Status:
```

## Release Decision

Use this after all test rows are filled.

| Decision item | Result |
| --- | --- |
| Courier smoke suite | PASS / FAIL / BLOCKED |
| Customer smoke suite | PASS / FAIL / BLOCKED |
| Cross-app checks | PASS / FAIL / BLOCKED |
| Open blocker count | |
| Open high severity count | |
| Ready for wider testing | YES / NO |
| Approver | |
| Approval date | |
