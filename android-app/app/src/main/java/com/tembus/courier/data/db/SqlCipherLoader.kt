package com.tembus.courier.data.db

import android.content.Context
import com.getkeepsafe.relinker.ReLinker

/** Loads SQLCipher on first encrypted-database access, not during app process start. */
object SqlCipherLoader {
    @Volatile
    private var loaded = false

    @Synchronized
    fun ensureLoaded(context: Context) {
        if (loaded) return
        ReLinker.loadLibrary(context.applicationContext, "sqlcipher")
        loaded = true
    }
}
