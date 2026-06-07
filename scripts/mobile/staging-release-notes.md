# Mobile Staging Release Notes

## 2026-06-07 - TomTom Android key rotation

- Trigger signed staging builds after rotating separate TomTom Android API keys.
- Expected GitHub Actions steps: Build Signed Release APK, Build Signed Release AAB, Upload named release assets, and Create Release.
- Do not commit local `.env`, APK, AAB, keystore, or Firebase config artifacts.
