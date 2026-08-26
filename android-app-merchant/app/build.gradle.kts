import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // 11.4: Firebase Cloud Messaging (order alert foreground/background/killed).
    id("com.google.gms.google-services")
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
    val prop = (project.findProperty("versionCode") as String?)?.toIntOrNull()
    if (prop != null) return prop
    return try {
        val proc = ProcessBuilder("git", "rev-list", "--count", "HEAD").start()
        proc.inputStream.bufferedReader().readText().trim().toInt()
    } catch (e: Exception) { 1 }
}

fun getVersionName(): String {
    val prop = (project.findProperty("versionName") as String?)?.takeIf { it.isNotBlank() }
    if (prop != null) return prop
    return try {
        val proc = ProcessBuilder("git", "describe", "--tags", "--always").start()
        val rawName = proc.inputStream.bufferedReader().readText().trim()
        val name = rawName.split("-").firstOrNull() ?: rawName
        name.ifBlank { "1.0.0" }
    } catch (e: Exception) { "1.0.0" }
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

val releaseKeystorePath = System.getenv("RELEASE_KEYSTORE_PATH").orEmpty()
val releaseKeystorePassword = System.getenv("RELEASE_KEYSTORE_PASSWORD").orEmpty()
val releaseKeyAlias = System.getenv("RELEASE_KEY_ALIAS").orEmpty()
val releaseKeyPassword = System.getenv("RELEASE_KEY_PASSWORD").orEmpty()
val releaseBaseUrl = getConfigValue("BASE_URL")
val releaseBuildConfigBaseUrl = normalizedBaseUrl(releaseBaseUrl.ifBlank { "https://missing-release-base-url.invalid/" })
val debugBaseUrl = getConfigValue("DEBUG_BASE_URL")
    .ifBlank { getConfigValue("MOBILE_API_BASE_URL") }
    .ifBlank { "https://api.bawain.my.id/api/v1/" }  // SECURITY: Always HTTPS, never cleartext
val debugBuildConfigBaseUrl = normalizedBaseUrl(debugBaseUrl)
// ── Auto-update (FB-2026-08): GitHub Releases untuk debug/staging, backend contract utk release ──
val githubReleasesApiUrl = getConfigValue("GITHUB_RELEASES_API_URL")
    .ifBlank { "https://api.github.com/repos/yogisyahroni/LANCAR/releases" }
val githubReleaseUpdatesEnabled = isEnabledFlag(getConfigValue("GITHUB_RELEASE_UPDATES_ENABLED").ifBlank { "true" })

fun isEnabledFlag(value: String): Boolean {
    return value.trim().lowercase() in setOf("1", "true", "yes", "on", "required")
}
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
    }
}

android {
    namespace = "com.tembus.merchant"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tembus.merchant"
        minSdk = 26
        targetSdk = 36
        versionCode = getVersionCode()
        versionName = getVersionName()

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
        }
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
            isShrinkResources = true
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "BASE_URL", quoteBuildConfigString(releaseBuildConfigBaseUrl))
            // SECURITY: Release builds use backend-only update contract.
            buildConfigField("boolean", "GITHUB_RELEASE_UPDATES_ENABLED", "false")
            buildConfigField("String", "GITHUB_RELEASES_API_URL", quoteBuildConfigString(githubReleasesApiUrl))
            buildConfigField("String", "GITHUB_RELEASE_ASSET_NAME", quoteBuildConfigString("tembus-merchant-release.apk"))
        }
        debug {
            isMinifyEnabled = false
            buildConfigField("String", "BASE_URL", quoteBuildConfigString(debugBuildConfigBaseUrl))
            // Debug/staging builds may sideload the latest APK from GitHub Releases.
            buildConfigField("boolean", "GITHUB_RELEASE_UPDATES_ENABLED", githubReleaseUpdatesEnabled.toString())
            buildConfigField("String", "GITHUB_RELEASES_API_URL", quoteBuildConfigString(githubReleasesApiUrl))
            buildConfigField("String", "GITHUB_RELEASE_ASSET_NAME", quoteBuildConfigString("tembus-merchant-release.apk"))
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
    implementation("androidx.annotation:annotation:1.7.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("androidx.activity:activity-compose:1.8.1")

    val composeBom = platform("androidx.compose:compose-bom:2024.09.02")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("androidx.navigation:navigation-compose:2.8.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.3")

    // DataStore & Security
    implementation("androidx.datastore:datastore-preferences:1.0.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // Coil for image loading
    implementation("io.coil-kt:coil-compose:2.5.0")

    // 11.4: Firebase Cloud Messaging (order alert saat app background/killed).
    // BoM mengunci versi Firebase supaya cocok dgn compileSdk 36.
    implementation(platform("com.google.firebase:firebase-bom:33.4.0"))
    implementation("com.google.firebase:firebase-messaging")
    // 11.4: WorkManager (fallback periodic poll saat FCM unavailable).
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    // FB-093: peta OSM untuk pin lokasi saat registrasi (tanpa API key)
    implementation("org.osmdroid:osmdroid-android:6.1.18")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
