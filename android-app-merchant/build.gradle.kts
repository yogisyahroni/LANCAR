plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.20" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.20" apply false
    // 11.4: Firebase Cloud Messaging (order alert saat app background/killed).
    // Plugin memerlukan google-services.json (ada placeholder di app/).
    id("com.google.gms.google-services") version "4.4.2" apply false
}
