# Mobile Privacy Policy And Data Safety Pack

Status: Ready for legal/product review and Play Console entry
Last updated: 2026-05-26
Scope: TEMBUS Courier and TEMBUS Customer Android apps

This pack maps current app behavior into a Play Console Data Safety checklist and a privacy policy draft. It is operational guidance, not legal advice. Final wording should be reviewed by the business owner before public production launch.

Official references:

- Google Play User Data policy and privacy policy requirements: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play Data Safety form guidance: https://support.google.com/googleplay/android-developer/answer/10787469

## Public Privacy URL

Prepared static policy page:

- Source file: `frontend/public/privacy/tembus-mobile.html`
- Expected hosted path after frontend deployment: `/privacy/tembus-mobile.html`
- Suggested production URL: `https://tembus.id/privacy/tembus-mobile.html`

Before Play Console submission, confirm the final URL:

- [ ] Is public without login.
- [ ] Is not a PDF.
- [ ] Is not blocked by geography, robots, or authentication.
- [ ] Uses HTTPS.
- [ ] Is linked inside the Play Console privacy policy field for both apps.

## Current App Data Inventory

| Data category | Courier app | Customer app | Purpose |
| --- | --- | --- | --- |
| Name | Collected during courier profile/registration | Collected during customer account/order flow | Account management, support, order fulfillment |
| Phone number | Collected for login/contact/order coordination | Collected for login/contact/order coordination | Authentication, OTP, courier/customer communication |
| Email | Collected where profile/registration requires it | Collected where account/profile requires it | Account management, support |
| Address | Pickup/delivery/order address may be shown to courier | Pickup/delivery/order address is entered/selected by customer | Order fulfillment, routing |
| Precise/coarse location | Used for courier tracking and navigation | Used for address selection/order tracking where enabled | Dispatch, routing, tracking, safety |
| Background location | Used by courier tracking service | Present in manifest and must be validated for actual customer need | Live tracking/order status |
| Camera/photos | Used for proof of delivery or upload flows | Used where proof/support/upload flow exists | Delivery evidence, support |
| Order details | Orders, status, recipient/pickup/drop metadata | Orders, status, pricing/payment state | Core logistics functionality |
| Payment status | Payout summaries/requests and payment state | Payment/session/status data | Settlement, checkout, accounting |
| Bank/payout details | Courier registration and payout requests can include bank account details | Not expected unless customer refund flow uses it | Courier payout processing |
| FCM/device token | Registered with backend | Registered with backend | Push notifications |
| Device/app info | App version, device token/fallback device ID, diagnostics | App version, device token/fallback device ID, diagnostics | Security, fraud prevention, notifications |
| Crash/analytics data | Firebase/Crashlytics/analytics if enabled | Firebase/Crashlytics/analytics if enabled | Reliability, diagnostics, product quality |

## Data Sharing And Service Providers

List these in the privacy policy as service providers/processors. In Play Console, answer "shared" according to Google's current Data Safety definitions and the actual contract/use case. If a provider processes data only on TEMBUS's behalf, it may be disclosed in the privacy policy without necessarily being marked as third-party sharing in every Data Safety row.

| Provider | Data involved | Purpose |
| --- | --- | --- |
| TEMBUS backend services | Account, order, location, payment/payout, notification token | Core app operation |
| Firebase / Google services | FCM token, device/app info, crash/diagnostic events, analytics events if enabled | Push notifications, crash reporting, analytics |
| Google Maps / map provider | Location, map/search/navigation context | Maps, routing, address selection |
| Payment provider | Payment session/status/order amount; no raw card data should be stored by TEMBUS apps | Checkout and payment status |
| Notification infrastructure | Device token, message metadata | Operational push notifications |

## Play Console Data Safety Draft

Use this as the starting answer set for both apps. Validate against the final implementation and any SDK dashboard settings before submitting.

| Play data type | Courier app | Customer app | Collected? | Shared? | Required? | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| Personal info: Name | Yes | Yes | Yes | No, unless support/provider processing requires it | Required for account/order use | Account management, app functionality |
| Personal info: Email address | Possible | Possible | Yes if profile flow collects it | No, unless support/provider processing requires it | Optional or required depending account policy | Account management, support |
| Personal info: Phone number | Yes | Yes | Yes | No, unless OTP/provider processing requires it | Required | Authentication, account security, order coordination |
| Location: Approximate location | Yes | Yes | Yes | Service provider processing | Required for location features | App functionality, routing, fraud/safety |
| Location: Precise location | Yes | Yes | Yes | Service provider processing | Required for dispatch/tracking features | App functionality, routing, live tracking |
| Photos and videos | Yes | Possible | Yes when proof/upload is used | No, unless support/provider processing requires it | Required only for proof/upload flows | App functionality, support |
| App activity: App interactions | Yes | Yes | Yes if analytics enabled | Service provider processing | Optional or required for diagnostics | Analytics, app functionality |
| App info and performance: Crash logs | Yes if Crashlytics enabled | Yes if Crashlytics enabled | Yes | Service provider processing | Optional for user, required for operations | Diagnostics, crash prevention |
| Device or other IDs | Yes | Yes | Yes | Service provider processing | Required for push/security | Notifications, fraud prevention, account security |
| Financial info: Purchase history/payment info | Payout/payment status | Payment status | Yes | Payment provider processing | Required for payment/payout flows | Payments, accounting, app functionality |

## Security Answers

Recommended Play Console answers if the current implementation remains in place:

- Data is encrypted in transit: Yes. Release builds require HTTPS API base URL.
- Users can request data deletion: Yes, through support/manual operations until a self-service endpoint exists.
- Data is used for app functionality: Yes.
- Data is used for analytics: Yes only if Firebase Analytics or equivalent is enabled for the distributed build.
- Data is used for fraud prevention, security, and compliance: Yes for auth/session/device/location checks.
- Data collection is optional: No for data required to create accounts, authenticate, create orders, dispatch couriers, or process payment/payout flows. Optional only where the user can skip the feature.

## Location Disclosure Notes

Both apps request location permissions. Courier usage is core to dispatch and real-time tracking. Customer usage should be reviewed carefully:

- If customer background location is not required in production, remove or avoid requesting it before public rollout.
- If customer background location remains required, disclose why it is needed in the privacy policy and in the app permission rationale.
- Precise location must be disclosed when GPS-level tracking or address selection uses it.
- Location should not be used for unrelated advertising or profiling unless the policy and Play form are updated.

## Data Retention Draft

Recommended production retention policy:

| Data | Suggested retention |
| --- | --- |
| Account/profile data | Retain while account is active; delete or anonymize after verified deletion request unless legally required. |
| Order and transaction records | Retain as required for accounting, dispute handling, fraud prevention, and legal obligations. |
| Courier location history | Retain only as long as operationally needed for order proof, dispute resolution, safety, and audit. |
| Unsynced local app data | Retain locally only until synchronized or logout/cache cleanup. |
| FCM/device tokens | Remove on logout, account deletion, token rotation, or device unlink. |
| Crash/diagnostic logs | Retain according to Firebase/observability settings; do not include raw secrets or full payment credentials. |

## Data Deletion Request Path

Until a self-service deletion endpoint is implemented, use this manual path:

1. User sends deletion request through support email or in-app support channel.
2. Support verifies account ownership.
3. Operations exports required account identifiers:
   - user ID / courier ID
   - phone/email
   - active order IDs
4. Operations blocks deletion while there are active orders, payout disputes, chargebacks, or legal holds.
5. Engineering deletes or anonymizes eligible profile/session/device-token data.
6. Engineering preserves legally required transaction/order records in minimized form.
7. Support confirms completion to the user.

Production follow-up:

- [ ] Add a self-service account deletion request flow in app or web.
- [ ] Add backend endpoint/runbook for verified deletion/anonymization.
- [ ] Add audit log for deletion request lifecycle.

## Play Console Submission Checklist

Complete this separately for Courier and Customer.

| Check | Courier | Customer |
| --- | --- | --- |
| Privacy policy URL is public and HTTPS | [ ] | [ ] |
| Privacy policy names TEMBUS and both apps | [ ] | [ ] |
| Privacy policy includes contact/deletion path | [ ] | [ ] |
| Data Safety form includes location | [ ] | [ ] |
| Data Safety form includes FCM/device IDs | [ ] | [ ] |
| Data Safety form includes crash/diagnostics if enabled | [ ] | [ ] |
| Data Safety form includes payment/payout metadata where applicable | [ ] | [ ] |
| Permissions match Play declarations | [ ] | [ ] |
| In-app permission rationale matches policy | [ ] | [ ] |
| No undeclared advertising/analytics SDK exists | [ ] | [ ] |

## Risk Register

| Risk | Severity | Owner action |
| --- | --- | --- |
| Customer app declares background location but product may not need it | High | Validate customer tracking requirement before public rollout. Remove permission if not needed. |
| Privacy policy is prepared in repo but not yet hosted publicly | High | Deploy frontend and confirm final URL before Play submission. |
| Manual data deletion path is slower than self-service deletion | Medium | Implement self-service deletion request in a future production-hardening task. |
| Firebase/analytics settings can change outside code | Medium | Recheck Firebase dashboards before Data Safety submission. |
| Payment provider behavior may affect sharing answers | Medium | Confirm provider contract and hosted payment flow before final submission. |
