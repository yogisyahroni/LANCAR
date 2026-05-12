package com.lancar.customer

import android.app.Application
import android.util.Log
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class LANCARApplication : Application() {

    private val TAG = "LANCARApplication"

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Customer Application created")
    }
}
