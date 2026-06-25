package com.tembus.customer.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.AppVersion
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Handles update checks and debug/staging sideload updates.
 *
 * Production release builds keep the backend update contract, while debug builds
 * can fetch the latest TEMBUS Customer APK from GitHub Releases and open the
 * Android package installer after explicit user confirmation.
 */
@Singleton
class UpdateManager @Inject constructor(
    private val apiService: TEMBUSApiService,
    @ApplicationContext private val context: Context
) {
    class InstallPermissionRequiredException : IllegalStateException(
        "Izin install aplikasi dari sumber ini belum aktif."
    )

    private val json = Json { ignoreUnknownKeys = true }
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(90, TimeUnit.SECONDS)
        .build()

    /**
     * Checks GitHub Releases first for debug/staging builds, then falls back to
     * the backend version endpoint for compatibility with production update
     * policy.
     */
    suspend fun checkUpdate(): AppVersion? {
        return checkGitHubReleaseUpdate() ?: checkBackendUpdate()
    }

    suspend fun downloadAndOpenInstaller(version: AppVersion): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                val updateUri = Uri.parse(version.updateUrl)
                val isApkUrl = version.updateUrl.contains(".apk", ignoreCase = true)

                if (!BuildConfig.GITHUB_RELEASE_UPDATES_ENABLED || !isApkUrl) {
                    openExternalUpdatePage(version.updateUrl)
                    return@withContext Result.success(Unit)
                }

                if (updateUri.scheme != "https" || updateUri.host.isNullOrBlank()) {
                    throw IOException("URL update harus menggunakan HTTPS.")
                }

                if (!canRequestPackageInstalls()) {
                    throw InstallPermissionRequiredException()
                }

                val updateDir = File(context.cacheDir, UPDATE_CACHE_DIR).apply {
                    if (!exists() && !mkdirs()) {
                        throw IOException("Gagal membuat folder cache update.")
                    }
                }
                val targetFile = File(updateDir, BuildConfig.GITHUB_RELEASE_ASSET_NAME)
                val tempFile = File(updateDir, "${BuildConfig.GITHUB_RELEASE_ASSET_NAME}.download")

                val request = Request.Builder()
                    .url(version.updateUrl)
                    .header("User-Agent", "TEMBUS-Customer/${BuildConfig.VERSION_NAME}")
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        throw IOException("Gagal mengunduh update: HTTP ${response.code}.")
                    }

                    val responseBody = response.body ?: throw IOException("File update kosong.")
                    tempFile.outputStream().use { output ->
                        responseBody.byteStream().use { input ->
                            input.copyTo(output)
                        }
                    }
                }

                if (tempFile.length() < MIN_APK_BYTES) {
                    throw IOException("File update tidak valid atau terlalu kecil.")
                }

                verifyChecksumIfPresent(tempFile, version.checksumSha256)
                validateDownloadedApk(tempFile, version.code)

                if (targetFile.exists() && !targetFile.delete()) {
                    throw IOException("Gagal mengganti file update lama.")
                }

                if (!tempFile.renameTo(targetFile)) {
                    tempFile.copyTo(targetFile, overwrite = true)
                    tempFile.delete()
                }

                openApkInstaller(targetFile)
                Result.success(Unit)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                Result.failure(normalizeUpdateFailure(error))
            }
        }
    }

    fun canRequestPackageInstalls(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            runCatching { context.packageManager.canRequestPackageInstalls() }.getOrDefault(false)
    }

    suspend fun openInstallPermissionSettings(targetContext: Context = context): Result<Unit> {
        val intents = buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                add(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${targetContext.packageName}")
                    }
                )
            }
            add(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${targetContext.packageName}")
                }
            )
            add(Intent(Settings.ACTION_SECURITY_SETTINGS))
        }

        return openFirstAvailableActivity(
            targetContext = targetContext,
            intents = intents,
            errorMessage = "Halaman izin install tidak bisa dibuka di perangkat ini."
        )
    }

    fun getCurrentVersionName(): String = BuildConfig.VERSION_NAME

    fun getCurrentVersionCode(): Int = BuildConfig.VERSION_CODE

    private suspend fun checkBackendUpdate(): AppVersion? {
        return try {
            val response = apiService.getLatestVersion("customer")
            if (!response.isSuccessful) {
                return null
            }

            val latest = response.body()
            if (latest != null && latest.code > BuildConfig.VERSION_CODE) latest else null
        } catch (_: Exception) {
            null
        }
    }

    private suspend fun checkGitHubReleaseUpdate(): AppVersion? {
        return withContext(Dispatchers.IO) {
            if (!BuildConfig.GITHUB_RELEASE_UPDATES_ENABLED) {
                return@withContext null
            }

            val releasesUrl = BuildConfig.GITHUB_RELEASES_API_URL.trim()
            if (!releasesUrl.startsWith("https://")) {
                return@withContext null
            }

            try {
                val request = Request.Builder()
                    .url(releasesUrl)
                    .header("Accept", "application/vnd.github+json")
                    .header("User-Agent", "TEMBUS-Customer/${BuildConfig.VERSION_NAME}")
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        return@withContext null
                    }

                    val responseBody = response.body?.string() ?: return@withContext null
                    val releases = runCatching {
                        json.decodeFromString<List<GitHubRelease>>(responseBody)
                    }.getOrNull() ?: return@withContext null

                    releases.asSequence()
                        .filterNot { it.draft }
                        .mapNotNull { release ->
                            val versionCode = CUSTOMER_TAG_REGEX
                                .find(release.tagName)
                                ?.groupValues
                                ?.getOrNull(1)
                                ?.toIntOrNull()
                                ?: return@mapNotNull null

                            if (versionCode <= BuildConfig.VERSION_CODE) {
                                return@mapNotNull null
                            }

                            val apkAsset = release.assets.firstOrNull {
                                it.name == BuildConfig.GITHUB_RELEASE_ASSET_NAME
                            } ?: return@mapNotNull null

                            AppVersion(
                                code = versionCode,
                                name = "1.0.$versionCode-staging",
                                force = false,
                                updateUrl = apkAsset.browserDownloadUrl,
                                checksumSha256 = apkAsset.sha256Digest()
                            )
                        }
                        .maxByOrNull { it.code }
                }
            } catch (_: Exception) {
                null
            }
        }
    }

    private suspend fun openExternalUpdatePage(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivitySafely(
            intent = intent,
            errorMessage = "Halaman update tidak bisa dibuka di perangkat ini."
        )
    }

    @Suppress("DEPRECATION")
    private suspend fun openApkInstaller(apkFile: File) {
        if (!apkFile.exists() || apkFile.length() < MIN_APK_BYTES) {
            throw IOException("File update tidak ditemukan atau tidak valid.")
        }

        val apkUri = runCatching {
            FileProvider.getUriForFile(
                context,
                "${context.packageName}.updateprovider",
                apkFile
            )
        }.getOrElse { error ->
            throw IOException("File update tidak bisa dibuka untuk installer Android.", error)
        }

        val installIntents = listOf(
            Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                data = apkUri
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                putExtra(Intent.EXTRA_RETURN_RESULT, false)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, APK_MIME_TYPE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )

        openFirstAvailableActivity(
            targetContext = context,
            intents = installIntents,
            grantReadUri = apkUri,
            errorMessage = "Installer Android tidak bisa dibuka di perangkat ini."
        ).getOrThrow()
    }

    private suspend fun startActivitySafely(intent: Intent, errorMessage: String) {
        withContext(Dispatchers.Main) {
            try {
                context.startActivity(intent)
            } catch (error: ActivityNotFoundException) {
                throw IOException(errorMessage, error)
            } catch (error: SecurityException) {
                throw IOException(errorMessage, error)
            } catch (error: IllegalArgumentException) {
                throw IOException(errorMessage, error)
            } catch (error: IllegalStateException) {
                throw IOException(errorMessage, error)
            } catch (error: RuntimeException) {
                throw IOException(errorMessage, error)
            }
        }
    }

    private suspend fun openFirstAvailableActivity(
        targetContext: Context,
        intents: List<Intent>,
        errorMessage: String,
        grantReadUri: Uri? = null
    ): Result<Unit> {
        val preparedIntents = withContext(Dispatchers.IO) {
            intents.onEach { intent ->
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                grantReadUri?.let { uri -> grantReadPermissionToResolvedInstallers(intent, uri) }
            }
        }

        return withContext(Dispatchers.Main) {
            var lastError: Throwable? = null
            preparedIntents.forEach { intent ->
                try {
                    targetContext.startActivity(intent)
                    return@withContext Result.success(Unit)
                } catch (error: ActivityNotFoundException) {
                    lastError = error
                } catch (error: SecurityException) {
                    lastError = error
                } catch (error: IllegalArgumentException) {
                    lastError = error
                } catch (error: IllegalStateException) {
                    lastError = error
                } catch (error: RuntimeException) {
                    lastError = error
                }
            }
            Result.failure(IOException(errorMessage, lastError))
        }
    }

    private fun grantReadPermissionToResolvedInstallers(intent: Intent, uri: Uri) {
        val handlers = runCatching {
            context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        }.getOrDefault(emptyList())

        handlers.forEach { resolveInfo ->
            val packageName = resolveInfo.activityInfo?.packageName ?: return@forEach
            runCatching {
                context.grantUriPermission(packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
    }

    private fun normalizeUpdateFailure(error: Throwable): Throwable {
        return when (error) {
            is InstallPermissionRequiredException,
            is IOException,
            is SecurityException -> error
            else -> IOException("Gagal menyiapkan update dengan aman.", error)
        }
    }

    private fun GitHubReleaseAsset.sha256Digest(): String? {
        val normalized = digest
            ?.trim()
            ?.removePrefix("sha256:")
            ?.lowercase()
        return normalized?.takeIf { SHA256_HEX_REGEX.matches(it) }
    }

    private fun verifyChecksumIfPresent(file: File, expectedSha256: String?) {
        val normalizedExpected = expectedSha256
            ?.trim()
            ?.removePrefix("sha256:")
            ?.lowercase()
            ?.takeIf { SHA256_HEX_REGEX.matches(it) }
            ?: return

        val actualSha256 = sha256(file)
        if (!actualSha256.equals(normalizedExpected, ignoreCase = true)) {
            throw SecurityException("Checksum update tidak sesuai.")
        }
    }

    private fun validateDownloadedApk(file: File, expectedVersionCode: Int) {
        val packageInfo = getArchivePackageInfo(file)
            ?: throw IOException("File update tidak bisa dibaca sebagai APK.")

        if (packageInfo.packageName != context.packageName) {
            throw SecurityException("Paket update bukan untuk aplikasi ini.")
        }

        validateDownloadedApkSignature(packageInfo)

        val downloadedVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode.toLong()
        }

        if (downloadedVersionCode <= BuildConfig.VERSION_CODE) {
            throw IOException("Versi update tidak lebih baru dari aplikasi saat ini.")
        }

        if (downloadedVersionCode != expectedVersionCode.toLong()) {
            throw IOException("Versi APK tidak sesuai dengan metadata update.")
        }
    }

    private fun getArchivePackageInfo(file: File): PackageInfo? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            context.packageManager.getPackageArchiveInfo(
                file.absolutePath,
                PackageManager.GET_SIGNING_CERTIFICATES
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageArchiveInfo(
                file.absolutePath,
                PackageManager.GET_SIGNATURES
            )
        }
    }

    private fun validateDownloadedApkSignature(downloadedPackageInfo: PackageInfo) {
        val installedPackageInfo = getInstalledPackageInfo()
        val installedSignatures = signingCertificateSha256Digests(installedPackageInfo)
        val downloadedSignatures = signingCertificateSha256Digests(downloadedPackageInfo)

        if (installedSignatures.isEmpty() || downloadedSignatures.isEmpty()) {
            throw SecurityException("Tanda tangan APK update tidak bisa diverifikasi.")
        }

        if (installedSignatures.intersect(downloadedSignatures).isEmpty()) {
            throw SecurityException(
                "Tanda tangan APK update berbeda dari aplikasi yang terpasang. " +
                    "Gunakan APK release dengan signing key yang sama."
            )
        }
    }

    private fun getInstalledPackageInfo(): PackageInfo {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNING_CERTIFICATES
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNATURES
            )
        }
    }

    private fun signingCertificateSha256Digests(packageInfo: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signingInfo = packageInfo.signingInfo ?: return emptySet()
            if (signingInfo.hasMultipleSigners()) {
                signingInfo.apkContentsSigners
            } else {
                signingInfo.signingCertificateHistory
            }
        } else {
            @Suppress("DEPRECATION")
            packageInfo.signatures
        } ?: return emptySet()

        return signatures.map { signature -> sha256(signature.toByteArray()) }.toSet()
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        file.inputStream().use { input ->
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private fun sha256(bytes: ByteArray): String {
        return MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    @Serializable
    private data class GitHubRelease(
        @SerialName("tag_name")
        val tagName: String,
        val draft: Boolean = false,
        val assets: List<GitHubReleaseAsset> = emptyList()
    )

    @Serializable
    private data class GitHubReleaseAsset(
        val name: String,
        val digest: String? = null,
        @SerialName("browser_download_url")
        val browserDownloadUrl: String
    )

    private companion object {
        private val CUSTOMER_TAG_REGEX = Regex("""v1\.0\.(\d+)""")
        private val SHA256_HEX_REGEX = Regex("^[a-f0-9]{64}$")
        private const val UPDATE_CACHE_DIR = "updates"
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        private const val MIN_APK_BYTES = 1_000_000L
    }
}
