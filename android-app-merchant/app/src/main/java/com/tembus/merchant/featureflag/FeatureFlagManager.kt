package com.tembus.merchant.featureflag

import android.content.Context
import android.util.Log
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.tembus.merchant.data.api.TEMBUSApiService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MerchantFeatureFlagValue(
    val enabled: Boolean,
    val variant: String?,
    val evaluationRevision: Long,
)

/** Server-evaluated feature flags. This never decides order/payment truth. */
object FeatureFlagManager {
    private const val PREFS_NAME = "tembus_feature_flags"
    private const val KEY_PAYLOAD = "payload"
    private const val KEY_FETCHED_AT = "fetched_at"
    private const val CACHE_TTL_MS = 15 * 60 * 1000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var context: Context? = null
    private var service: TEMBUSApiService? = null
    private var cache: Map<String, JsonElement> = emptyMap()
    private val _snapshot = MutableStateFlow<Map<String, MerchantFeatureFlagValue>>(emptyMap())
    val snapshot: StateFlow<Map<String, MerchantFeatureFlagValue>> = _snapshot.asStateFlow()

    fun init(context: Context, service: TEMBUSApiService) {
        this.context = context.applicationContext
        this.service = service
        readPersisted()?.let { updateSnapshot(it) }
        scope.launch { fetchOnce() }
    }

    suspend fun fetchOnce() {
        val api = service ?: return
        runCatching {
            val response = api.getFeatureFlags()
            if (response.isSuccessful) response.body()?.let(::persist)
        }
    }

    fun isEnabled(key: String, default: Boolean = false): Boolean =
        _snapshot.value[key]?.enabled ?: default

    fun getString(key: String, default: String = ""): String =
        _snapshot.value[key]?.variant ?: default

    private fun readPersisted(): Map<String, JsonElement>? {
        val prefs = context?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) ?: return null
        if (System.currentTimeMillis() - prefs.getLong(KEY_FETCHED_AT, 0L) >= CACHE_TTL_MS) return null
        val raw = prefs.getString(KEY_PAYLOAD, null) ?: return null
        return runCatching { parseRoot(com.google.gson.JsonParser.parseString(raw)) }.getOrNull()
    }

    private fun persist(root: JsonElement) {
        val parsed = parseRoot(root)
        context?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)?.edit()
            ?.putString(KEY_PAYLOAD, root.toString())
            ?.putLong(KEY_FETCHED_AT, System.currentTimeMillis())
            ?.apply()
        updateSnapshot(parsed)
    }

    private fun parseRoot(root: JsonElement): Map<String, JsonElement> {
        if (root.isJsonArray) {
            return root.asJsonArray.mapNotNull { row ->
                if (!row.isJsonObject) return@mapNotNull null
                val key = row.asJsonObject.get("key")?.takeIf { it.isJsonPrimitive }?.asString ?: return@mapNotNull null
                key to row
            }.toMap()
        }
        if (!root.isJsonObject) return emptyMap()
        val rootObject = root.asJsonObject
        val envelope = rootObject.get("data")?.takeIf { it.isJsonObject }?.asJsonObject ?: rootObject
        val flags = envelope.get("flags")?.takeIf { it.isJsonObject }?.asJsonObject ?: envelope
        return flags.entrySet().associate { it.key to it.value }
    }

    private fun updateSnapshot(values: Map<String, JsonElement>) {
        cache = values
        val states = values.mapValues { (_, element) ->
            val flagObject = element.takeIf { it.isJsonObject }?.asJsonObject
            val enabled = flagObject?.get("enabled")?.asBooleanSafe() ?: element.asBooleanSafe() ?: false
            val variant = flagObject?.get("variant")?.asStringSafe()
            val revision = flagObject?.get("evaluation_revision")?.asLongSafe()?.takeIf { it > 0L } ?: 1L
            MerchantFeatureFlagValue(enabled, variant, revision)
        }
        _snapshot.value = states
        Log.d("FeatureFlagManager", "merchant feature flags refreshed count=${states.size} max_revision=${states.values.maxOfOrNull { it.evaluationRevision } ?: 0L}")
    }

    private fun JsonElement.asBooleanSafe(): Boolean? = runCatching {
        if (!isJsonPrimitive) null else asBoolean
    }.getOrNull()

    private fun JsonElement.asStringSafe(): String? = runCatching {
        if (!isJsonPrimitive) null else asString.takeIf { it.isNotBlank() }
    }.getOrNull()

    private fun JsonElement.asLongSafe(): Long? = runCatching {
        if (!isJsonPrimitive) null else asLong
    }.getOrNull()
}
