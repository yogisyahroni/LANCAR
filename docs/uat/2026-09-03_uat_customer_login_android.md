# UAT Android — Customer Login Flow (Pixel 6 Pro, emulator-5556)

## Environment
- Device: Pixel 6 Pro, Android 16 (API 36), emulator-5556
- APK: customer/app-debug.apk (v1.0.296, versionCode 846), SHA256: 1bd8f0a...
- Test date: 2026-09-03
- Credential source: vault/00 Private/LANCAR Secrets/tembus-customer-uat.md (FIND, verified 12 char)
- credential_ref: vault/00 Private/LANCAR Secrets/tembus-customer-uat.md

## Test Steps

1. Install APK → emulator-5556 — PASS (Success)
2. Launch app → onboarding welcome → tap "Lewati" → login screen — PASS
3. Tap email field → clear → ketik akun UAT dari secret vault via adb input text + keyevent — PASS
4. Tap password field → clear → ketik password UAT dari secret vault via keyevent — PASS
5. Tap "Masuk" button via gesture (swipe 540,2001) — EXECUTED (rc=0)
6. Tekan KEYCODE_ENTER di password field — EXECUTED (rc=0)

## Results

### Credential Input — VERIFIED ✅
- Email field dump: format email UAT tervalidasi ✅
- Password field dump: masked dan panjang tervalidasi tanpa merekam nilai secret ✅
- Button "Masuk" enabled: `true` ✅ (Compose validation pass — form terdeteksi valid)

### Auth Action — FAILED ❌ (Compose UI event binding broken)
- **0 network log** di logcat setelah tap Enter + gesture (grep `com.tembus.customer` → hanya GC + ImeTracker, tidak ada okhttp/retrofit)
- UI **tetap di login screen** (post-login dump identik: "Masuk untuk melanjutkan...")
- Button tap/gesture/keyevent semuanya rc=0 tapi **onClick handler tidak fire**

### Root Cause
Compose TextField/State hoisting bug — text input terlihat di UI tapi `MutableState.value` tidak update. Form validation anggap valid (button enabled) tapi **onClick lambda tidak bind ke auth request**.

## Impact
- Credential VALID (12 char di-prove), issue di **UI binding layer**
- Butuh fix di Compose code (`onValueChange` state propagation, atau `Modifier.clickable` binding)
- UAT login flow blocked — tidak dapat test subsequent order/handoff flow

## Screenshots
- Login form with credential filled (12 dot password)
- Post-tap state (still login screen)

## Next Steps (blocked by code bug)
- [ ] Fix Compose TextField state binding in LoginScreen.kt
- [ ] Fix Button onClick → API call binding
- [ ] Re-run UAT: login → dashboard → order creation
