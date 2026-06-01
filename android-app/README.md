# TEMBUS Courier - Android Native App

Native Android application for TEMBUS logistics courier drivers, built with Kotlin and Jetpack Compose.

## Features

- **Push Notifications (FCM)**: Real-time order assignment alerts with Accept/Dismiss actions
- **Order Acceptance**: Accept orders directly from notification with full order data
- **View Map**: Open delivery location in Google Maps
- **Call Customer**: Initiate phone call to customer from order detail
- **Proof of Delivery**: Camera capture with order info overlay
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
2. Add an Android app with package name `com.tembus.courier`
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
tembus-courier-release.apk
```

Do not use the debug APK as the baseline for self-update testing. Debug APKs are signed with a local or CI debug key that can change, and Android will reject an update package when the signature does not match the app already installed on the device.

## Project Structure

```
android-app/
├── app/
│   └── src/main/
│       ├── java/com/tembus/courier/
│       │   ├── TEMBUSApplication.kt      # App initialization, notification channels
│       │   ├── service/
│       │   │   ├── TEMBUSFirebaseMessagingService.kt  # FCM message handling
│       │   │   └── NotificationDismissReceiver.kt
│       │   ├── receiver/
│       │   │   ├── BootReceiver.kt        # Re-registers FCM after boot
│       │   │   └── NotificationReceiver.kt
│       │   ├── ui/
│       │   │   ├── MainActivity.kt        # Entry point
│       │   │   ├── screens/MainScreen.kt  # Dashboard UI
│       │   │   └── theme/                 # Material 3 theming
│       │   ├── data/
│       │   │   ├── model/Models.kt        # Data classes
│       │   │   ├── api/                   # Retrofit API
│       │   │   └── repository/            # FCM token management
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
3. **Backend Registration**: Token sent to `POST /api/v1/courier/fcm/register`
4. **Notification Received**: TEMBUSFirebaseMessagingService.onMessageReceived()
5. **Display**: High-priority notification shown with TEMBUS branding

## Backend Integration

The app expects these API endpoints:
- `POST /api/v1/courier/fcm/register` - Register FCM token
- `POST /api/v1/courier/fcm/unregister` - Unregister FCM token

FCM payload format (type: "order_assignment"):
```json
{
  "type": "order_assignment",
  "title": "New Order Assigned!",
  "body": "Pickup: Jl. Sudirman. Tap to view.",
  "order_id": "ORD-12345",
  "priority": 1
}
```

## Notification Channels

| Channel | ID | Priority |
|---------|-----|----------|
| Order Assignments | tembus_orders | HIGH |
| General Updates | tembus_general | DEFAULT |

## TODO

- [ ] Add unit tests for FCM handling
- [ ] Implement order list screen
- [ ] Add WebSocket for real-time updates
- [ ] Integrate with auth service for courier login
- [ ] Add offline queue for order sync

## License

Proprietary - PT. Tembus Logistic Indonesia
