package com.tembus.merchant.ui

import java.text.NumberFormat
import java.util.Locale

/** Format util bersama — dipakai di semua screen. */
object Format {
    fun rupiah(value: Long): String {
        val nf = NumberFormat.getNumberInstance(Locale("id", "ID"))
        return "Rp " + nf.format(value)
    }
}
