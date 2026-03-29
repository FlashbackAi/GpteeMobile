package com.gpteemobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BatteryOptimizationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "BatteryOptimizationModule"
    }

    /**
     * Check if battery optimization is disabled for the app
     */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                val packageName = reactApplicationContext.packageName
                val isIgnoring = powerManager.isIgnoringBatteryOptimizations(packageName)
                promise.resolve(isIgnoring)
            } else {
                // Battery optimization doesn't exist before Android M
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to check battery optimization status: ${e.message}")
        }
    }

    /**
     * Open battery optimization settings for the app
     */
    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${reactApplicationContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            // Fallback: open app settings
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactApplicationContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } catch (fallbackError: Exception) {
                promise.reject("ERROR", "Failed to open settings: ${fallbackError.message}")
            }
        }
    }
}
