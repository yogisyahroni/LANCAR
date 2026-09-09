package com.tembus.customer.ui.navigation

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

enum class RemoteInternalDestination {
    HOME,
    FOOD,
    FOOD_FAVORITES,
    PROMO,
    ORDERS,
    SUPPORT,
    PROFILE,
}

sealed interface RemoteDeepLinkTarget {
    data class Internal(val destination: RemoteInternalDestination) : RemoteDeepLinkTarget
    data class External internal constructor(val url: String) : RemoteDeepLinkTarget
    data object Invalid : RemoteDeepLinkTarget
}

/**
 * Resolves manifest CTA targets into a finite, compiled destination set.
 * Remote strings never reach NavController.navigate or an implicit intent
 * without passing this policy.
 */
internal object RemoteDeepLinkResolver {
    private val externalHosts = setOf("bawain.my.id", "www.bawain.my.id", "app.bawain.my.id")

    fun resolve(deepLink: String?, externalUrl: String?): RemoteDeepLinkTarget {
        val internal = deepLink?.trim().orEmpty()
        val external = externalUrl?.trim().orEmpty()
        if (internal.isNotEmpty() && external.isNotEmpty()) return RemoteDeepLinkTarget.Invalid
        if (internal.isNotEmpty()) return resolveInternal(internal)
        if (external.isNotEmpty()) return resolveExternal(external)
        return RemoteDeepLinkTarget.Invalid
    }

    /** Starts only an already-validated first-party HTTPS URL. */
    fun openExternalUrl(context: Context, target: RemoteDeepLinkTarget.External): Boolean {
        // Revalidate at the handoff boundary as defense in depth. The public
        // target type can be carried across UI layers, so do not trust a URL
        // merely because it is wrapped in External.
        val validatedTarget = resolve(null, target.url) as? RemoteDeepLinkTarget.External ?: return false
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(validatedTarget.url)).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            if (intent.resolveActivity(context.packageManager) == null) return false
            context.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    private fun resolveInternal(raw: String): RemoteDeepLinkTarget {
        if (raw.startsWith("//") || raw.contains("..") || Regex("%2e", RegexOption.IGNORE_CASE).containsMatchIn(raw)) {
            return RemoteDeepLinkTarget.Invalid
        }
        val uri = runCatching { java.net.URI(raw) }.getOrNull() ?: return RemoteDeepLinkTarget.Invalid
        val route = if (uri.scheme.equals("lancar", ignoreCase = true)) {
            val host = uri.host ?: return RemoteDeepLinkTarget.Invalid
            if (uri.userInfo != null || uri.port != -1) return RemoteDeepLinkTarget.Invalid
            listOf(host.lowercase()) + pathSegments(uri.rawPath)
        } else if (uri.scheme == null && raw.startsWith("/") && !raw.startsWith("//")) {
            pathSegments(uri.rawPath)
        } else {
            return RemoteDeepLinkTarget.Invalid
        }

        if (uri.rawFragment != null) return RemoteDeepLinkTarget.Invalid
        return when (route) {
            listOf("home") -> RemoteDeepLinkTarget.Internal(RemoteInternalDestination.HOME)
            listOf("food") -> RemoteDeepLinkTarget.Internal(RemoteInternalDestination.FOOD)
            listOf("food", "favorites") -> RemoteDeepLinkTarget.Internal(RemoteInternalDestination.FOOD_FAVORITES)
            listOf("promo") -> RemoteDeepLinkTarget.Internal(RemoteInternalDestination.PROMO)
            listOf("orders") -> RemoteDeepLinkTarget.Internal(RemoteInternalDestination.ORDERS)
            listOf("support") -> RemoteDeepLinkTarget.Internal(RemoteInternalDestination.SUPPORT)
            listOf("profile") -> RemoteDeepLinkTarget.Internal(RemoteInternalDestination.PROFILE)
            else -> RemoteDeepLinkTarget.Invalid
        }
    }

    private fun resolveExternal(raw: String): RemoteDeepLinkTarget {
        if (raw.contains("..") || Regex("%2e", RegexOption.IGNORE_CASE).containsMatchIn(raw)) {
            return RemoteDeepLinkTarget.Invalid
        }
        val uri = runCatching { java.net.URI(raw) }.getOrNull() ?: return RemoteDeepLinkTarget.Invalid
        val host = uri.host?.lowercase() ?: return RemoteDeepLinkTarget.Invalid
        val safe = uri.scheme.equals("https", ignoreCase = true)
            && host in externalHosts
            && uri.userInfo == null
            && (uri.port == -1 || uri.port == 443)
            && uri.rawFragment == null
        return if (safe) RemoteDeepLinkTarget.External(uri.toASCIIString()) else RemoteDeepLinkTarget.Invalid
    }

    private fun pathSegments(rawPath: String?): List<String> = rawPath.orEmpty()
        .split('/')
        .filter { it.isNotEmpty() }
        .map { it.lowercase() }
}

internal fun dispatchRemoteDeepLinkFailure(target: RemoteDeepLinkTarget) {
    if (target is RemoteDeepLinkTarget.Invalid) {
        Log.w("RemoteDeepLink", "event=invalid_manifest_target")
    }
}
