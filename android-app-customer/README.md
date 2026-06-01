# TEMBUS Customer - Android Native App

Native Android application for TEMBUS customers, built with Kotlin and Jetpack Compose.

## Features

- **Push Notifications (FCM)**: Real-time order, payment, and tracking alerts
- **Order Booking**: Create delivery orders from the customer app
- **Live Tracking**: Follow courier progress from pickup to drop-off
- **Payment Flow**: Open payment status and wallet-related screens
- **Profile Management**: Manage customer profile data and support contact
- **Foreground & Background Handling**: Notification states handled for all app states
- **Location Sync**: Real-time GPS tracking with backend synchronization
- **Offline Queue**: Orders stored locally and synced when online
- **Material Design 3 UI**: Modern Jetpack Compose interface
- **API Integration**: Retrofit-based backend communication

## Setup

### 1. Prerequisites
- Android Studio Hedgehog or later
- Kotlin 1.9+
- Android SDK 34
- Firebase account (for FCM)

### 2. Firebase Configuration

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Add an Android app with package name `com.tembus.customer`
3. Download `google-services.json` and place in `app/` directory
4. Enable Cloud Messaging in Firebase Console

### 3. Build

```bash
./gradlew assembleDebug
```

### 4. Install on Device

For local development and emulator testing:
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

For staging or hardware testing with GitHub Release self-update, install the signed release APK from the release assets:

```bash
tembus-customer-release.apk
```

Do not use the debug APK as the baseline for self-update testing. Debug APKs are signed with a local or CI debug key that can change, and Android will reject an update package when the signature does not match the app already installed on the device.

## Project Structure

```
android-app-customer/
├── app/
│   └── src/main/
│       ├── java/com/tembus/customer/
│       │   ├── TEMBUSApplication.kt      # App initialization, notification channels
│       │   ├── service/
│       │   │   ├── TEMBUSFirebaseMessagingService.kt  # FCM message handling
│       │   ├── receiver/
│       │   │   ├── BootReceiver.kt        # Schedules resync after boot
│       │   │   └── NetworkChangeReceiver.kt
│       │   ├── ui/
│       │   │   ├── MainActivity.kt        # Entry point
│       │   │   ├── screens/main/          # Dashboard UI
│       │   │   └── theme/                 # Material 3 theming
│       │   ├── data/
│       │   │   ├── model/                 # Data classes
│       │   │   ├── api/                   # Retrofit API
│       │   │   └── repository/            # Customer data repositories
│       │   └── util/
│       │       └── NotificationHelper.kt   # Notification utilities
│       └── res/
│           ├── values/                    # Colors, strings, themes
│           ├── drawable/                  # Icons
│           └── xml/                       # Network config
├── build.gradle.kts
└── settings.gradle.kts
```

## Push Notification Flow

1. **App Start**: MainActivity requests POST_NOTIFICATIONS permission (Android 13+)
2. **FCM Token**: Obtained via FirebaseMessaging.getInstance().token
3. **Backend Registration**: Token sent to the customer notification registration API
4. **Notification Received**: TEMBUSFirebaseMessagingService.onMessageReceived()
5. **Display**: High-priority notification shown with TEMBUS branding

## Backend Integration

The app expects customer auth, order, profile, tracking, payment, and notification APIs exposed through the configured mobile API base URL.

FCM payload format example:
```json
{
  "type": "tracking_update",
  "title": "Order Update",
  "body": "Courier is heading to pickup.",
  "order_id": "ORD-12345",
  "priority": 1
}
```

## Notification Channels

| Channel | ID | Priority |
|---------|-----|----------|
| Customer Notifications | tembus_customer_notifications | HIGH |

## TODO

- [ ] Add more unit tests for FCM handling
- [ ] Add more end-to-end booking smoke tests
- [ ] Expand offline queue coverage for customer order sync

## License

Proprietary - PT. Tembus Logistic Indonesia
