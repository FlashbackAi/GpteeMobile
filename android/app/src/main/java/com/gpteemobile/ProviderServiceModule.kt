package com.gpteemobile

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ProviderServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "ProviderService"
    }

    @ReactMethod
    fun startService() {
        ProviderForegroundService.startService(reactApplicationContext)
    }

    @ReactMethod
    fun stopService() {
        ProviderForegroundService.stopService(reactApplicationContext)
    }
}
