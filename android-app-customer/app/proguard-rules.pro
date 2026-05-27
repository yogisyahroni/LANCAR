# =========================================================
# TEMBUS CUSTOMER APP: ENTERPRISE PROGUARD & OBFUSCATION RULES
# =========================================================

# ---------------------------------------------------------
# 1. CORE ANDROID & FIREBASE
# ---------------------------------------------------------
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# ---------------------------------------------------------
# 2. NETWORKING: RETROFIT & OKHTTP & SOCKET.IO
# ---------------------------------------------------------
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keep class okhttp3.** { *; }

# Keep Socket.IO classes
-keep class io.socket.** { *; }
-keepclassmembers class io.socket.** { *; }

# ---------------------------------------------------------
# 3. KOTLINX SERIALIZATION (CRITICAL FOR DATA TRANSFER)
# ---------------------------------------------------------
-keepattributes *Annotation*, EnclosingMethod, InnerClasses
-keep class kotlinx.serialization.** { *; }
-keepclassmembers class * {
    *** Companion;
}
-keepclassmembers class * {
    *** $serializer;
}

# ---------------------------------------------------------
# 4. APP SPECIFIC DATA MODELS (MUST NOT BE OBFUSCATED)
# ---------------------------------------------------------
# Keep Data Models specifically for Tembus Customer
-keep class com.tembus.customer.data.model.** { *; }
-keepclassmembers class com.tembus.customer.data.model.** { *; }

# ---------------------------------------------------------
# 5. DEPENDENCY INJECTION: HILT / DAGGER
# ---------------------------------------------------------
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$ComponentManager { *; }
-dontwarn dagger.hilt.**

# ---------------------------------------------------------
# 6. LOCAL STORAGE: ROOM & SQLCIPHER (CRITICAL FOR OFFLINE)
# ---------------------------------------------------------
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.**

# SQLCIPHER MUST BE KEPT TO AVOID RUNTIME NATIVE CRASHES
-keep class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.** { *; }
-keepclassmembers class net.sqlcipher.database.** { *; }
-keepclassmembers class * extends net.sqlcipher.database.SQLiteOpenHelper {
    <init>(...);
}
-dontwarn net.sqlcipher.**

# ---------------------------------------------------------
# 7. ASYNC & BACKGROUND: COROUTINES & WORKMANAGER
# ---------------------------------------------------------
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

-keep class androidx.work.** { *; }
-dontwarn androidx.work.**
-keepclassmembers class * extends androidx.work.Worker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# ---------------------------------------------------------
# 8. SECURITY LIBRARIES & ROOT DETECTION
# ---------------------------------------------------------
-keep class com.scottyab.rootbeer.** { *; }
-dontwarn com.scottyab.rootbeer.**

# ---------------------------------------------------------
# 9. ENUM CLASSES (PREVENT SERIALIZATION CRASHES)
# ---------------------------------------------------------
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
