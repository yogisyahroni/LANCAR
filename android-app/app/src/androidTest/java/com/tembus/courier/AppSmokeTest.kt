package com.tembus.courier

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Regression smoke: pastikan APK terinstall, package terdaftar, dan
 * instrumentation runner hidup (app tidak crash saat attach).
 */
@RunWith(AndroidJUnit4::class)
class AppSmokeTest {

    @Test
    fun packageIsInstalledAndContextAvailable() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assertNotNull("Target context harus tersedia", context)
        val pm = context.packageManager
        val info = pm.getPackageInfo("com.tembus.courier", 0)
        assertNotNull("Package com.tembus.courier harus terinstall", info)
    }
}