package com.tembus.courier.ui.screens

internal fun displayDemandIntensity(value: String): String = when (value.lowercase()) {
    "high" -> "tinggi"
    "medium" -> "sedang"
    "low" -> "rendah"
    else -> value.replace('_', ' ')
}

internal fun displayDemandSource(value: String): String = when (value.lowercase()) {
    "server_demand_rollup" -> "Sumber server"
    else -> "Sumber ${value.replace('_', ' ')}"
}

internal fun displayDemandFreshness(value: String): String = when (value.lowercase()) {
    "fresh" -> "Data terbaru"
    "stale" -> "Data lama"
    else -> "Status data ${value.replace('_', ' ')}"
}
