# On-Demand FCM Staging Checklist

Use this checklist for the final device-only validation of customer and courier push notifications.

## Preconditions

- `FIREBASE_SERVICE_ACCOUNT` is set on the staging admin service.
- `GET /api/v1/system/on-demand-readiness` returns `overall_status = ready_for_staging_validation`.
- Customer Android app and courier Android app are installed from the staging build.
- Both apps point to the staging API and have Firebase configured.
- Test customer and test courier accounts can log in on real device or emulator.

## Token Registration

1. Log in as customer and confirm the app calls `POST /api/v1/customer/notifications/register-token`.
2. Log in as courier and confirm the app calls `POST /api/v1/courier/fcm/register`.
3. Verify both tokens are present in `user_devices` with `platform = android`.

## On-Demand Push Flow

1. Customer creates an on-demand order.
2. Courier app receives `Pekerjaan On Demand Baru` while foregrounded.
3. Repeat with courier app backgrounded.
4. Repeat with courier app killed if the emulator/device supports delivery.
5. Courier accepts the offer.
6. Customer receives status updates through socket first; push notification is a fallback signal.

## Expected Fallback

If FCM delivery is delayed or unavailable, Socket.IO and polling must still update:

- Customer tracking detail.
- Customer web order detail.
- Courier offer/order list.
- Chat messages in the order room.

Record the Firebase message id, order id, courier user id, customer user id, and app state for every failed delivery.
