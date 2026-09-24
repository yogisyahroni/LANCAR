# Add project specific ProGuard rules here.
# Retrofit reads the generic continuation type generated for Kotlin suspend
# functions (for example Continuation<? super Response<AuthResponse>>).
# Keep the complete signature context; without InnerClasses/EnclosingMethod
# R8 can leave Retrofit with a raw Class and it then throws
# Class cannot be cast to java.lang.reflect.ParameterizedType at runtime.
-keepattributes Signature,InnerClasses,EnclosingMethod
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations
-keepattributes RuntimeVisibleParameterAnnotations,RuntimeInvisibleParameterAnnotations

# Keep the Retrofit service contract stable in minified release APKs. Retrofit
# creates this interface through a dynamic proxy and inspects its annotations
# and generic method parameters at runtime.
-keep interface com.tembus.merchant.data.api.TEMBUSApiService { *; }

# Keep Gson model fields (reflection-based serialization)
-keepattributes *Annotation*
-keep class com.tembus.merchant.data.model.** { *; }
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
