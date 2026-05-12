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
