plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
    id("com.google.devtools.ksp") version "1.9.20-1.0.14"
    id("com.google.dagger.hilt.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.firebase.crashlytics")
}


fun getEnvVariable(key: String): String {
    val envFile = rootProject.file("../.env")
    if (!envFile.exists()) return ""
    
    envFile.readLines().forEach { line ->
        val trimmed = line.trim()
        if (!trimmed.startsWith("#") && trimmed.contains("=")) {
            val parts = trimmed.split("=", limit = 2)
            if (parts[0].trim() == key) {
                return parts[1].trim().removeSurrounding("\"").removeSurrounding("'")
            }
        }
    }
    return ""
}

android {
    namespace = "com.lancar.customer"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.lancar.customer"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = getEnvVariable("GOOGLE_MAPS_API_KEY")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "BASE_URL", "\"https://api.lancar.com/\"")
        }
        debug { 
            isMinifyEnabled = false 
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:8080/\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    buildFeatures { 
        compose = true 
        buildConfig = true
    }

    composeOptions { kotlinCompilerExtensionVersion = "1.5.5" }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("androidx.activity:activity-compose:1.8.1")

    val composeBom = platform("androidx.compose:compose-bom:2023.10.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.3")

    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:32.7.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("com.google.firebase:firebase-analytics-ktx")
    implementation("com.google.firebase:firebase-crashlytics-ktx")

    // WorkManager for background handling
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // DataStore & Security
    implementation("androidx.datastore:datastore-preferences:1.0.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Room Database for offline order queue (PTLAAA-45)
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")
    // 🔒 Security Enhancement: SQLCipher for on-disk Room DB encryption
    implementation("androidx.sqlite:sqlite-ktx:2.4.0")
    implementation("net.zetetic:android-database-sqlcipher:4.5.4")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Real-time Duplex Engine (Socket.IO) for In-App Chat sync
    implementation("io.socket:socket.io-client:2.1.0") {
        exclude(group = "org.json", module = "json")
    }

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")

    // CameraX for Proof of Delivery feature (PTLAAA-53)
    val cameraxVersion = "1.3.0"
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")
    
    // ExifInterface for image rotation correction
    implementation("androidx.exifinterface:exifinterface:1.3.6")
    
    // Coil for image loading in Compose
    implementation("io.coil-kt:coil-compose:2.5.0")
    
    // Accompanist for runtime permissions in Compose
    implementation("com.google.accompanist:accompanist-permissions:0.32.0")

    // Google Maps & Location Engine
    implementation("com.google.maps.android:maps-compose:4.3.3")
    implementation("com.google.android.gms:play-services-maps:18.2.0")
    implementation("com.google.android.gms:play-services-location:21.1.0")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    testImplementation("io.mockk:mockk:1.13.8")
    testImplementation("androidx.arch.core:core-testing:2.2.0")
    testImplementation("app.cash.turbine:turbine:1.0.0") // Great for testing Flows!
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // Hilt
    implementation("com.google.dagger:hilt-android:2.48")
    ksp("com.google.dagger:hilt-android-compiler:2.48")
    implementation("androidx.hilt:hilt-navigation-compose:1.1.0")
}
