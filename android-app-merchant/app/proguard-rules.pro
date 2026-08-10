# Add project specific ProGuard rules here.
# Keep Gson model fields (reflection-based serialization)
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.tembus.merchant.data.model.** { *; }
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
