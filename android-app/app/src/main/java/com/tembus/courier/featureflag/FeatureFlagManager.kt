package com.tembus.courier.featureflag

import android.content.Context
import android.util.Log
import com.tembus.courier.data.api.TEMBUSApiService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

data class CourierFeatureFlagValue(
    val enabled: Boolean,
    val variant: String?,
    val evaluationRevision: Long,
)

object FeatureFlagManager {

    private const val PREFS_NAME = "tembus_feature_flags"
    private const val KEY_PAYLOAD = "payload"
    private const val KEY_FETCHED_AT = "fetched_at"
    private const val CACHE_TTL_MS = 15 * 60 * 1000L
    private val VARIANT_KEYS = arrayOf("variant", "value", "string_value")

    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var apiService: TEMBUSApiService? = null

    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var cache: Map<String, JsonElement>? = null

    private val _snapshot = MutableStateFlow<Map<String, CourierFeatureFlagValue>>(emptyMap())
    val snapshot: StateFlow<Map<String, CourierFeatureFlagValue>> = _snapshot.asStateFlow()

    fun init(context: Context, service: TEMBUSApiService) {
        appContext = context.applicationContext
        apiService = service
        scope.launch { fetchOnce() }
    }

    suspend fun fetchOnce() {
        val service = apiService ?: return
        runCatching {
            val response = service.getFeatureFlags()
            if (response.isSuccessful) {
                response.body()?.let { persist(it) }
            }
        }
    }

    fun isEnabled(key: String, default: Boolean): Boolean {
        val element = flags()[key] ?: return default
        return evaluate(element).first ?: default
    }

    fun getString(key: String, default: String): String {
        val element = flags()[key] ?: return default
        return evaluate(element).second ?: default
    }

    private fun flags(): Map<String, JsonElement> {
        cache?.let { return it }
        val persisted = readPersistedFlags()
        if (persisted != null) updateSnapshot(persisted)
        return persisted ?: emptyMap()
    }

    private fun readPersistedFlags(): Map<String, JsonElement>? {
        val context = appContext ?: return null
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val fetchedAt = prefs.getLong(KEY_FETCHED_AT, 0L)
        if (System.currentTimeMillis() - fetchedAt >= CACHE_TTL_MS) return null
        val payload = prefs.getString(KEY_PAYLOAD, null) ?: return null
        return runCatching { parseRoot(json.parseToJsonElement(payload)) }.getOrNull()
    }

    private fun persist(root: JsonElement) {
        val parsed = parseRoot(root)
        appContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            ?.edit()
            ?.putString(KEY_PAYLOAD, root.toString())
            ?.putLong(KEY_FETCHED_AT, System.currentTimeMillis())
            ?.apply()
        cache = parsed
        updateSnapshot(parsed)
    }

    private fun parseRoot(root: JsonElement): Map<String, JsonElement> = when (root) {
        is JsonObject -> {
            val envelope = (root["data"] as? JsonObject) ?: root
            (envelope["flags"] as? JsonObject ?: envelope).toMap()
        }
        is JsonArray -> buildMap {
            for (item in root) {
                val entry = item as? JsonObject ?: continue
                val key = entry["key"]?.jsonPrimitive?.contentOrNull ?: continue
                put(key, entry)
            }
        }
        else -> emptyMap()
    }

    private fun evaluate(element: JsonElement): Pair<Boolean?, String?> = when (element) {
        is JsonPrimitive -> element.jsonPrimitive.booleanOrNull to element.jsonPrimitive.contentOrNull
        is JsonObject -> {
            val enabled = element["enabled"]?.jsonPrimitive?.booleanOrNull
            val variant = VARIANT_KEYS.firstNotNullOfOrNull { candidate ->
                element[candidate]?.jsonPrimitive?.contentOrNull
            }
            enabled to variant
        }
        else -> null to null
    }

    private fun evaluationRevision(element: JsonElement): Long =
        (element as? JsonObject)
            ?.get("evaluation_revision")
            ?.jsonPrimitive
            ?.longOrNull
            ?.takeIf { it > 0L }
            ?: 1L

    private fun updateSnapshot(values: Map<String, JsonElement>) {
        val states = values.mapValues { (_, element) ->
            val evaluated = evaluate(element)
            CourierFeatureFlagValue(
                enabled = evaluated.first ?: false,
                variant = evaluated.second,
                evaluationRevision = evaluationRevision(element),
            )
        }
        _snapshot.value = states
        val maxRevision = states.values.maxOfOrNull { it.evaluationRevision } ?: 0L
        Log.d("FeatureFlagManager", "courier feature flags refreshed evaluation_revision=$maxRevision count=${states.size}")
    }
}
