# ──────────────────────────────────────────────────────────────────────────────
# TEMBUS COURIER — PRODUCTION PROGUARD RULES
# Grade S++ Hardened | Version 2.0.0
# ──────────────────────────────────────────────────────────────────────────────

# ── GLOBAL DEBUGGING ──────────────────────────────────────────────────────────
# Preserve line numbers for production crash reports (Firebase Crashlytics)
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── FIREBASE / FCM ────────────────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ── RETROFIT 2 ────────────────────────────────────────────────────────────────
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}
-dontwarn retrofit2.**

# ── OKHTTP3 ───────────────────────────────────────────────────────────────────
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-keep class okio.** { *; }
-dontwarn okio.**
-keep class okhttp3.internal.ws.** { *; }
-dontwarn okhttp3.internal.ws.**

# ── KOTLINX SERIALIZATION ─────────────────────────────────────────────────────
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.lancar.courier.data.model.** { *; }
-keepclassmembers class com.lancar.courier.data.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.lancar.courier.data.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
# Keep all data models (required for Room + Retrofit deserialization)
-keep class com.lancar.courier.data.model.** { *; }

# ── ROOM DATABASE ─────────────────────────────────────────────────────────────
-keep class androidx.room.** { *; }
-keepclassmembers class * extends androidx.room.RoomDatabase {
    abstract *;
}
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao class * { *; }
-dontwarn androidx.room.**

# ── SQLCIPHER (Encrypted Room Database) ───────────────────────────────────────
# CRITICAL: Without this, AES-256 encrypted DB will crash at runtime with ClassNotFoundException
-keep class net.zetetic.database.** { *; }
-keep class net.zetetic.** { *; }
-dontwarn net.zetetic.**

# ── WORKMANAGER ───────────────────────────────────────────────────────────────
# CRITICAL: WorkManager uses reflection to instantiate Workers — obfuscating breaks all background sync
-keep class androidx.work.** { *; }
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.CoroutineWorker
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}
-dontwarn androidx.work.**

# ── HILT (Dependency Injection) ───────────────────────────────────────────────
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.HiltAndroidApp
-dontwarn dagger.hilt.**

# ── ROOTBEER (Anti-Fraud Root Detection) ──────────────────────────────────────
-keep class com.scottyab.rootbeer.** { *; }
-dontwarn com.scottyab.rootbeer.**

# ── SOCKET.IO & ENGINE.IO (Real-time Chat & GPS Sync) ────────────────────────
-keep class io.socket.** { *; }
-dontwarn io.socket.**
-keep class engine.io.** { *; }
-dontwarn engine.io.**
-keep class org.json.** { *; }

# ── CAMERAX (Proof of Delivery) ───────────────────────────────────────────────
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# ── KOTLINX COROUTINES ────────────────────────────────────────────────────────
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# ── KOTLIN REFLECTION ─────────────────────────────────────────────────────────
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.reflect.**

# ── ENUM CLASSES ──────────────────────────────────────────────────────────────
# CRITICAL: Prevents Retrofit @SerialName enum deserialization from breaking in production
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── ANDROID SECURITY CRYPTO (EncryptedSharedPreferences / JWT Token Store) ────
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# ── GOOGLE MAPS ───────────────────────────────────────────────────────────────
-keep class com.google.maps.** { *; }
-dontwarn com.google.maps.**

# ── DATASTORE PREFERENCES ─────────────────────────────────────────────────────
-keep class androidx.datastore.** { *; }
-dontwarn androidx.datastore.**

