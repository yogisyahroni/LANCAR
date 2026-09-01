package com.tembus.merchant.ui.screens.menu

import com.tembus.merchant.data.model.MenuItemRequest

data class MenuImportRow(
    val lineNumber: Int,
    val request: MenuItemRequest
)

data class MenuImportParseResult(
    val rows: List<MenuImportRow>,
    val errors: List<String>
)

/** CSV parser used by the Android bulk menu flow. It accepts Indonesian and API column names. */
object MenuImportParser {
    fun parse(csv: String): MenuImportParseResult {
        val records = parseRecords(csv)
        if (records.isEmpty()) return MenuImportParseResult(emptyList(), listOf("File CSV kosong."))
        val headers = records.first().map { normalize(it) }
        val nameIndex = headers.indexOfFirst { it in setOf("nama", "name", "nama_menu") }
        val priceIndex = headers.indexOfFirst { it in setOf("harga", "price", "harga_idr") }
        val categoryIndex = headers.indexOfFirst { it in setOf("kategori", "category") }
        if (nameIndex < 0 || priceIndex < 0 || categoryIndex < 0) {
            return MenuImportParseResult(
                emptyList(),
                listOf("Header wajib: nama, harga, kategori. Template tidak sesuai.")
            )
        }
        val descriptionIndex = headers.indexOfFirst { it in setOf("deskripsi", "description") }
        val prepIndex = headers.indexOfFirst { it in setOf("prep_time_minutes", "waktu_masak", "prep_time") }
        val availabilityIndex = headers.indexOfFirst { it in setOf("is_available", "tersedia", "available") }
        val rows = mutableListOf<MenuImportRow>()
        val errors = mutableListOf<String>()
        records.drop(1).forEachIndexed { index, cells ->
            val line = index + 2
            if (cells.all { it.isBlank() }) return@forEachIndexed
            val name = cells.value(nameIndex).trim()
            val priceText = cells.value(priceIndex).trim().replace(".", "").replace(",", "")
            val category = cells.value(categoryIndex).trim()
            val description = cells.value(descriptionIndex).trim().ifBlank { null }
            val prep = cells.value(prepIndex).trim().ifBlank { "15" }.toIntOrNull()
            val available = cells.value(availabilityIndex).trim().ifBlank { "true" }.toBooleanStrictOrNull()
            val price = priceText.toLongOrNull()
            when {
                name.isBlank() -> errors += "Baris $line: nama menu wajib diisi."
                price == null || price < 0 -> errors += "Baris $line: harga harus berupa angka >= 0."
                category.isBlank() -> errors += "Baris $line: kategori wajib diisi."
                prep == null || prep !in 1..240 -> errors += "Baris $line: waktu masak harus 1–240 menit."
                available == null -> errors += "Baris $line: is_available harus true atau false."
                else -> rows += MenuImportRow(
                    line,
                    MenuItemRequest(name, price, deskripsi = description, kategori = category, prepTimeMinutes = prep, isAvailable = available)
                )
            }
        }
        if (rows.isEmpty() && errors.isEmpty()) errors += "Tidak ada baris menu untuk diimpor."
        return MenuImportParseResult(rows, errors)
    }

    private fun normalize(value: String): String = value.trim().lowercase().replace(" ", "_")

    private fun List<String>.value(index: Int): String = if (index in indices) this[index] else ""

    private fun parseRecords(csv: String): List<List<String>> {
        val records = mutableListOf<List<String>>()
        val row = mutableListOf<String>()
        val cell = StringBuilder()
        var quoted = false
        var i = 0
        fun flushCell() { row += cell.toString(); cell.clear() }
        fun flushRow() {
            flushCell()
            if (row.any { it.isNotBlank() }) records += row.toList()
            row.clear()
        }
        while (i < csv.length) {
            val char = csv[i]
            when {
                char == '"' && quoted && i + 1 < csv.length && csv[i + 1] == '"' -> { cell.append('"'); i++ }
                char == '"' -> quoted = !quoted
                char == ',' && !quoted -> flushCell()
                (char == '\n' || char == '\r') && !quoted -> {
                    if (char == '\r' && i + 1 < csv.length && csv[i + 1] == '\n') i++
                    flushRow()
                }
                else -> cell.append(char)
            }
            i++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) flushRow()
        return records
    }
}
