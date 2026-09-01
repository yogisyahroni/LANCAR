package com.tembus.merchant.ui.screens.menu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MenuImportParserTest {
    @Test
    fun parsesQuotedCommaAndIndonesianHeaders() {
        val result = MenuImportParser.parse(
            "nama,harga,kategori,deskripsi,waktu_masak,tersedia\n" +
                "\"Nasi, Ayam\",25000,Makanan,\"Pedas, gurih\",20,true\n"
        )
        assertEquals(1, result.rows.size)
        assertTrue(result.errors.isEmpty())
        assertEquals("Nasi, Ayam", result.rows.single().request.nama)
        assertEquals("Pedas, gurih", result.rows.single().request.deskripsi)
    }

    @Test
    fun rejectsInvalidRowsBeforeCallingApi() {
        val result = MenuImportParser.parse(
            "name,price,category\n" +
                "Bakso,-1,Makanan\n" +
                ",12000,Makanan\n"
        )
        assertTrue(result.rows.isEmpty())
        assertEquals(2, result.errors.size)
    }
}
