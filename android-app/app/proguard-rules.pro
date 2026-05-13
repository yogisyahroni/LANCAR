# FCM
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.lancar.courier.data.model.** { *; }
-keepclassmembers class com.lancar.courier.data.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.lancar.courier.data.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep data classes
-keep class com.lancar.courier.data.model.** { *; }

# Socket.IO & Engine.IO (Real-time Sync Security)
-keep class io.socket.** { *; }
-dontwarn io.socket.**
-keep class okhttp3.internal.ws.** { *; }
-dontwarn okhttp3.internal.ws.**
-keep class org.json.** { *; }
-keep class engine.io.** { *; }
-dontwarn engine.io.**

