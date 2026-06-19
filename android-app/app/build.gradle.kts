import java.net.URI

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

fun getFirstConfigValue(vararg keys: String): String {
    keys.forEach { key ->
        val value = getConfigValue(key)
        if (value.isNotBlank()) return value
    }
    return ""
}

fun getVersionCode(): Int {
    return (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 1
}

fun getGitVersion(): String {
    return try {
        val process = ProcessBuilder("git", "describe", "--tags", "--always", "--dirty")
            .redirectError(ProcessBuilder.Redirect.PIPE)
            .start()
        process.inputStream.bufferedReader().readText().trim().takeIf { it.isNotBlank() } ?: "1.0.0"
    } catch (e: Exception) {
        "1.0.0"
    }
}

fun getVersionName(): String {
    return (project.findProperty("versionName") as String?)?.takeIf { it.isNotBlank() } ?: getGitVersion()
}

fun normalizedBaseUrl(value: String): String {
    val trimmed = value.trim()
    return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
}

fun quoteBuildConfigString(value: String): String {
    return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}

fun validateReleaseBaseUrl(value: String) {
    if (value.isBlank()) {
        throw GradleException("BASE_URL is required for release builds. Set MOBILE_API_BASE_URL in GitHub Actions variables.")
    }

    val uri = runCatching { URI(value) }.getOrElse {
        throw GradleException("BASE_URL must be a valid absolute HTTPS URL.")
    }

    if (uri.scheme != "https" || uri.host.isNullOrBlank()) {
        throw GradleException("BASE_URL for release builds must use HTTPS and include a host.")
    }
}

fun isEnabledFlag(value: String): Boolean {
    return value.trim().lowercase() in setOf("1", "true", "yes", "on", "required")
}

fun isValidTomTomApiKey(value: String): Boolean {
    return Regex("^[A-Za-z0-9_-]{16,128}$").matches(value.trim())
}

fun isValidSha256CertificatePin(value: String): Boolean {
    return Regex("^sha256/[A-Za-z0-9+/]{43}=$").matches(value.trim())
}

fun validateReleaseTomTomKeyConfig(
    appLabel: String,
    specificKey: String,
    requiredEnvDescription: String
) {
    if (specificKey.isBlank()) {
        throw GradleException(
            "Release $appLabel build requires a platform-specific TomTom Android key. " +
                "Set $requiredEnvDescription."
        )
    }

    if (!isValidTomTomApiKey(specificKey)) {
        throw GradleException(
            "Release $appLabel TomTom Android key must use a valid TomTom Maps API key format."
        )
    }
}

fun validateReleaseCertificatePinConfig(
    pinningRequired: Boolean,
    primaryPin: String,
    backupPin: String
) {
    if (!pinningRequired) return

    if (!isValidSha256CertificatePin(primaryPin)) {
        throw GradleException(
            "API_CERT_SHA256_PIN_PRIMARY must be set to a valid sha256/<base64> pin " +
                "when API_CERT_PINNING_REQUIRED=true."
        )
    }

    if (!isValidSha256CertificatePin(backupPin)) {
        throw GradleException(
            "API_CERT_SHA256_PIN_BACKUP must be set to a valid sha256/<base64> backup pin " +
                "when API_CERT_PINNING_REQUIRED=true."
        )
    }

    if (primaryPin.trim() == backupPin.trim()) {
        throw GradleException("API_CERT_SHA256_PIN_BACKUP must be different from the primary pin.")
    }
}

val releaseKeystorePath = System.getenv("RELEASE_KEYSTORE_PATH").orEmpty()
val releaseKeystorePassword = System.getenv("RELEASE_KEYSTORE_PASSWORD").orEmpty()
val releaseKeyAlias = System.getenv("RELEASE_KEY_ALIAS").orEmpty()
val releaseKeyPassword = System.getenv("RELEASE_KEY_PASSWORD").orEmpty()
val releaseBaseUrl = getConfigValue("BASE_URL")
val releaseBuildConfigBaseUrl = normalizedBaseUrl(releaseBaseUrl.ifBlank { "https://missing-release-base-url.invalid/" })
val debugBaseUrl = getConfigValue("DEBUG_BASE_URL")
    .ifBlank { getConfigValue("MOBILE_API_BASE_URL") }
    .ifBlank { "http://10.0.2.2:8080/" }
val debugBuildConfigBaseUrl = normalizedBaseUrl(debugBaseUrl)
val githubReleasesApiUrl = getConfigValue("GITHUB_RELEASES_API_URL")
    .ifBlank { "https://api.github.com/repos/yogisyahroni/LANCAR/releases" }
val releaseCertificatePinPrimary = getConfigValue("API_CERT_SHA256_PIN_PRIMARY").trim()
val releaseCertificatePinBackup = getConfigValue("API_CERT_SHA256_PIN_BACKUP").trim()
val releaseCertificatePinningRequired = isEnabledFlag(getConfigValue("API_CERT_PINNING_REQUIRED"))
val githubReleaseUpdatesEnabled = isEnabledFlag(getConfigValue("GITHUB_RELEASE_UPDATES_ENABLED").ifBlank { "true" })
val courierTomTomAndroidApiKey = getFirstConfigValue(
    "TOMTOM_ANDROID_COURIER_API_KEY",
    "COURIER_TOMTOM_ANDROID_API_KEY"
)
val effectiveTomTomAndroidApiKey = courierTomTomAndroidApiKey
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

    if (requiresReleaseSigning) {
        validateReleaseBaseUrl(releaseBaseUrl)
        validateReleaseCertificatePinConfig(
            releaseCertificatePinningRequired,
            releaseCertificatePinPrimary,
            releaseCertificatePinBackup
        )
        validateReleaseTomTomKeyConfig(
            "courier",
            courierTomTomAndroidApiKey,
            "TOMTOM_ANDROID_COURIER_API_KEY or COURIER_TOMTOM_ANDROID_API_KEY"
        )
    }
}

android {
    namespace = "com.tembus.courier"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tembus.courier"
        minSdk = 26
        targetSdk = 34
        versionCode = getVersionCode()
        versionName = getVersionName()

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }

        missingDimensionStrategy("tomtom-sdk-version", "complete")

        buildConfigField("String", "TOMTOM_API_KEY", quoteBuildConfigString(effectiveTomTomAndroidApiKey))
        buildConfigField("String", "API_CERT_SHA256_PIN_PRIMARY", quoteBuildConfigString(releaseCertificatePinPrimary))
        buildConfigField("String", "API_CERT_SHA256_PIN_BACKUP", quoteBuildConfigString(releaseCertificatePinBackup))
        buildConfigField("boolean", "API_CERT_PINNING_REQUIRED", releaseCertificatePinningRequired.toString())
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
            buildConfigField("String", "BASE_URL", quoteBuildConfigString(releaseBuildConfigBaseUrl))
            buildConfigField("boolean", "GITHUB_RELEASE_UPDATES_ENABLED", githubReleaseUpdatesEnabled.toString())
            buildConfigField("String", "GITHUB_RELEASES_API_URL", quoteBuildConfigString(githubReleasesApiUrl))
            buildConfigField("String", "GITHUB_RELEASE_ASSET_NAME", quoteBuildConfigString("tembus-courier-release.apk"))
        }
        debug {
            isMinifyEnabled = false
            buildConfigField("String", "BASE_URL", quoteBuildConfigString(debugBuildConfigBaseUrl))
            buildConfigField("boolean", "GITHUB_RELEASE_UPDATES_ENABLED", "true")
            buildConfigField("String", "GITHUB_RELEASES_API_URL", quoteBuildConfigString(githubReleasesApiUrl))
            buildConfigField("String", "GITHUB_RELEASE_ASSET_NAME", quoteBuildConfigString("tembus-courier-release.apk"))
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

kotlin {
    jvmToolchain(17)
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

    // Room Database for offline order queue (PTLAAA-45)
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")
    // 🔒 Security Enhancement: SQLCipher for on-disk Room DB encryption
    implementation("androidx.sqlite:sqlite-ktx:2.4.0")
    // Use the modern artifact because the legacy android-database-sqlcipher package
    // ships native libraries that are not compatible with Android 15+ 16 KB pages.
    implementation("net.zetetic:sqlcipher-android:4.10.0")

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
    val cameraxVersion = "1.4.2"
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")
    implementation("com.google.zxing:core:3.5.4")
    
    // ML Kit for Active Liveness Detection
    implementation("com.google.mlkit:face-detection:16.1.7")
    
    // TomTom Maps & Navigation Engine for courier operations.
    // Play Services Location remains only for device GPS, not map rendering.
    val tomTomNavigationSdkVersion = "2.3.0"
    implementation("com.tomtom.sdk.maps:map-display-common-android-complete:$tomTomNavigationSdkVersion")
    implementation("com.tomtom.sdk.maps:map-display-engine-gl:$tomTomNavigationSdkVersion")
    implementation("com.tomtom.sdk:init:$tomTomNavigationSdkVersion")
    implementation("com.tomtom.sdk.location:provider-simulation:$tomTomNavigationSdkVersion")
    implementation("com.tomtom.sdk.routing:route-planner:$tomTomNavigationSdkVersion")
    implementation("com.tomtom.sdk.navigation:navigation:$tomTomNavigationSdkVersion")
    implementation("com.google.android.gms:play-services-location:21.1.0")

    // WebRTC audio for secure in-app courier-customer calls.
    val streamWebRtcVersion = "1.3.9"
    implementation("io.getstream:stream-webrtc-android:$streamWebRtcVersion")

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
