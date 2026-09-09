package com.tembus.courier.data.localization

import java.text.DateFormat
import java.text.NumberFormat
import java.util.Currency
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Shared locale rules for courier UI and user-facing formatting. */
object LocaleContract {
    const val DEFAULT_LANGUAGE_TAG = "id-ID"
    const val DEFAULT_LANGUAGE_CODE = "id"
    val SUPPORTED_LANGUAGE_TAGS = setOf("id-ID", "en-US")

    fun normalizeLanguageTag(value: String?): String = if (value?.trim()?.lowercase(Locale.ROOT)?.startsWith("en") == true) "en-US" else DEFAULT_LANGUAGE_TAG
    fun languageCode(value: String?): String = if (normalizeLanguageTag(value).startsWith("en")) "en" else "id"
    fun localeFor(value: String?): Locale = Locale.forLanguageTag(normalizeLanguageTag(value))
    fun fallbackChain(requested: String?, marketDefault: String? = DEFAULT_LANGUAGE_TAG): List<String> {
        val request = requested?.trim()?.replace('_', '-')?.ifBlank { DEFAULT_LANGUAGE_TAG } ?: DEFAULT_LANGUAGE_TAG
        val market = marketDefault?.trim()?.replace('_', '-')?.ifBlank { DEFAULT_LANGUAGE_TAG } ?: DEFAULT_LANGUAGE_TAG
        return listOf(request, request.substringBefore('-'), market, market.substringBefore('-'), DEFAULT_LANGUAGE_TAG, "id").distinct()
    }
    fun isRtl(value: String?): Boolean = setOf("ar", "fa", "he", "ur", "ps", "ku", "dv", "yi").contains(value?.trim()?.replace('_', '-')?.substringBefore('-')?.lowercase(Locale.ROOT))
}

object LocaleFormatters {
    private const val STYLE_DATE = 1
    private const val STYLE_TIME = 2
    private const val STYLE_DATETIME = 3
    fun number(value: Number, languageTag: String?): String = NumberFormat.getNumberInstance(LocaleContract.localeFor(languageTag)).format(value)
    fun currency(value: Number, currencyCode: String = "IDR", languageTag: String?): String {
        val formatter = NumberFormat.getCurrencyInstance(LocaleContract.localeFor(languageTag))
        formatter.currency = Currency.getInstance(currencyCode)
        if (currencyCode == "IDR") formatter.maximumFractionDigits = 0
        return formatter.format(value)
    }
    fun date(epochMillis: Long, languageTag: String?, timeZoneId: String? = null): String = format(epochMillis, languageTag, timeZoneId, STYLE_DATE)
    fun time(epochMillis: Long, languageTag: String?, timeZoneId: String? = null): String = format(epochMillis, languageTag, timeZoneId, STYLE_TIME)
    fun dateTime(epochMillis: Long, languageTag: String?, timeZoneId: String? = null): String = format(epochMillis, languageTag, timeZoneId, STYLE_DATETIME)
    fun address(street: String?, district: String?, city: String?, region: String?, postalCode: String?, country: String?, languageTag: String?): String {
        val values = if (LocaleContract.localeFor(languageTag).language == "en") listOf(street, city, region, postalCode, district, country) else listOf(street, district, city, region, postalCode, country)
        return values.filter { !it.isNullOrBlank() }.joinToString(", ") { it!!.trim() }
    }
    fun phone(number: String?, countryCode: String = "ID"): String {
        val raw = number?.trim().orEmpty()
        if (raw.isBlank()) return "—"
        val digits = raw.filter { it.isDigit() }
        val dialCode = when (countryCode.uppercase(Locale.ROOT)) { "US", "CA" -> "1"; "SG" -> "65"; else -> "62" }
        val national = if (raw.startsWith("+")) digits.removePrefix(dialCode) else digits.removePrefix("0")
        return "+$dialCode ${national.chunked(4).joinToString(" ")}".trim()
    }
    private fun format(epochMillis: Long, languageTag: String?, timeZoneId: String?, style: Int): String {
        val locale = LocaleContract.localeFor(languageTag)
        val formatter = when (style) {
            STYLE_DATE -> DateFormat.getDateInstance(DateFormat.MEDIUM, locale)
            STYLE_TIME -> DateFormat.getTimeInstance(DateFormat.SHORT, locale)
            else -> DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, locale)
        }
        timeZoneId?.takeIf { it.isNotBlank() }?.let { formatter.timeZone = TimeZone.getTimeZone(it) }
        return formatter.format(Date(epochMillis))
    }
}
