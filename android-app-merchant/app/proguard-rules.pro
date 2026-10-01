# TEMBUS MERCHANT: production R8 rules for reflection-heavy networking.
# Retrofit reads the generic continuation type generated for Kotlin suspend
# functions (for example Continuation<? super Response<AuthResponse>>).
# Keep the complete signature context; without the rules below R8 can leave
# Retrofit with a raw Class and release login fails with
# Class cannot be cast to java.lang.reflect.ParameterizedType.
-keepattributes Signature,InnerClasses,EnclosingMethod
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keepattributes RuntimeVisibleParameterAnnotations,RuntimeInvisibleParameterAnnotations
-keepattributes *Annotation*

# Keep the Retrofit service contract stable in minified release APKs. Retrofit
# creates this interface through a dynamic proxy and inspects its annotations
# and generic method parameters at runtime.
-keep class retrofit2.** { *; }
-keep interface com.tembus.merchant.data.api.TEMBUSApiService { *; }
-keep class com.tembus.merchant.data.api.** { *; }
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-dontwarn retrofit2.**
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>

# OkHttp is also reflection/annotation driven in parts of its runtime graph.
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Keep Gson model fields (reflection-based serialization)
-keep class com.tembus.merchant.data.model.** { *; }
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
