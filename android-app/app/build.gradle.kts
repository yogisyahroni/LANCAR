plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
    id("com.google.devtools.ksp")
    id("com.google.dagger.hilt.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.firebase.crashlytics")
}


fun getConfigValue(key: String): String {
    val envValue = System.getenv(key)
    if (!envValue.isNullOrBlank()) return envValue

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

fun getVersionCode(): Int {
    return (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 1
}

fun getVersionName(): String {
    return (project.findProperty("versionName") as String?)?.takeIf { it.isNotBlank() } ?: "1.0.0"
}

val releaseKeystorePath = System.getenv("RELEASE_KEYSTORE_PATH").orEmpty()
val releaseKeystorePassword = System.getenv("RELEASE_KEYSTORE_PASSWORD").orEmpty()
val releaseKeyAlias = System.getenv("RELEASE_KEY_ALIAS").orEmpty()
val releaseKeyPassword = System.getenv("RELEASE_KEY_PASSWORD").orEmpty()
val hasReleaseSigning = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).all { it.isNotBlank() }

gradle.taskGraph.whenReady {
    val requiresReleaseSigning = listOf(
        ":app:assembleRelease",
        ":app:bundleRelease",
        "assembleRelease",
        "bundleRelease"
    ).any { taskPath -> hasTask(taskPath) }

    if (requiresReleaseSigning && !hasReleaseSigning) {
        throw GradleException(
            "Release signing requires RELEASE_KEYSTORE_PATH, RELEASE_KEYSTORE_PASSWORD, " +
                "RELEASE_KEY_ALIAS, and RELEASE_KEY_PASSWORD."
        )
    }
}

android {
    namespace = "com.lancar.courier"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.lancar.courier"
        minSdk = 26
        targetSdk = 34
        versionCode = getVersionCode()
        versionName = getVersionName()

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = getConfigValue("GOOGLE_MAPS_API_KEY")
        
        buildConfigField("String", "BASE_URL", "\"${getConfigValue("BASE_URL")}\"")
        buildConfigField("String", "API_CERT_SHA256_PIN_PRIMARY", "\"${getConfigValue("API_CERT_SHA256_PIN_PRIMARY")}\"")
        buildConfigField("String", "API_CERT_SHA256_PIN_BACKUP", "\"${getConfigValue("API_CERT_SHA256_PIN_BACKUP")}\"")
    }

    signingConfigs {
        create("release") {
            if (hasReleaseSigning) {
                storeFile = file(releaseKeystorePath)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            // 📦 OPTIMIZATION: Automatically strip unused resources to reduce production APK bloat
            isShrinkResources = true
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug { isMinifyEnabled = false }
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
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
    implementation("androidx.activity:activity-compose:1.8.1")

    val composeBom = platform("androidx.compose:compose-bom:2024.02.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3:1.2.0")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("androidx.navigation:navigation-compose:2.7.5")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.6.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.6.2")

    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:32.7.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("com.google.firebase:firebase-analytics-ktx")
    implementation("com.google.firebase:firebase-crashlytics-ktx")

    // WorkManager for background handling
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // DataStore
    implementation("androidx.datastore:datastore-preferences:1.0.0")

    // Security & Anti-Fraud
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.fragment:fragment-ktx:1.6.2")
    implementation("com.scottyab:rootbeer-lib:0.1.0")

    // Room Database for offline order queue (PTLAAA-45)
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")
    // 🔒 Security Enhancement: SQLCipher for on-disk Room DB encryption
    implementation("androidx.sqlite:sqlite-ktx:2.4.0")
    implementation("net.zetetic:android-database-sqlcipher:4.5.4")

    // Networking & Serialization (Modern Data Stack)
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Real-time Duplex Engine (Socket.IO) for In-App Chat sync
    implementation("io.socket:socket.io-client:2.1.0") {
        exclude(group = "org.json", module = "json")
    }

    // Dagger Hilt
    val hiltVersion = "2.50"
    val hiltJetpackVersion = "1.1.0"
    implementation("com.google.dagger:hilt-android:$hiltVersion")
    ksp("com.google.dagger:hilt-android-compiler:$hiltVersion")
    implementation("androidx.hilt:hilt-navigation-compose:$hiltJetpackVersion")
    implementation("androidx.hilt:hilt-work:$hiltJetpackVersion")
    ksp("androidx.hilt:hilt-compiler:$hiltJetpackVersion")

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
    implementation("com.google.mlkit:barcode-scanning:17.2.0")
    
    // Google Maps Engine for Order Tracking
    implementation("com.google.maps.android:maps-compose:4.3.3")
    implementation("com.google.android.gms:play-services-maps:18.2.0")
    implementation("com.google.android.gms:play-services-location:21.1.0")
    implementation("org.maplibre.gl:android-sdk:13.0.2")

    // ExifInterface for image rotation correction
    implementation("androidx.exifinterface:exifinterface:1.3.6")
    
    // Coil for image loading in Compose
    implementation("io.coil-kt:coil-compose:2.5.0")
    
    // Accompanist for runtime permissions in Compose
    implementation("com.google.accompanist:accompanist-permissions:0.32.0")

    // Testing
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
