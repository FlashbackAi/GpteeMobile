package com.gpteemobile

import android.os.Build
import android.os.PowerManager
import android.content.Context
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.concurrent.fixedRateTimer

class ThermalManagerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var monitoringTimer: java.util.Timer? = null
    private val powerManager: PowerManager? = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager

    override fun getName(): String {
        return "ThermalManager"
    }

    /**
     * Get current thermal status
     */
    @ReactMethod
    fun getCurrentThermalStatus(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val info = getThermalInfo()
                promise.resolve(info)
            } else {
                // For Android < 10, return nominal
                val result = Arguments.createMap().apply {
                    putString("status", "nominal")
                    putInt("statusCode", 0)
                }
                promise.resolve(result)
            }
        } catch (e: Exception) {
            promise.reject("THERMAL_ERROR", "Failed to get thermal status: ${e.message}", e)
        }
    }

    /**
     * Start monitoring thermal status
     * @param intervalMs Polling interval in milliseconds
     */
    @ReactMethod
    fun startMonitoring(intervalMs: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            sendEvent("onThermalStatusChanged", Arguments.createMap().apply {
                putString("status", "nominal")
                putInt("statusCode", 0)
            })
            return
        }

        stopMonitoring() // Stop any existing timer

        monitoringTimer = fixedRateTimer("ThermalMonitor", daemon = true, period = intervalMs.toLong()) {
            try {
                val info = getThermalInfo()
                sendEvent("onThermalStatusChanged", info)
            } catch (e: Exception) {
                // Silently fail - thermal monitoring is best-effort
            }
        }
    }

    /**
     * Stop monitoring thermal status
     */
    @ReactMethod
    fun stopMonitoring() {
        monitoringTimer?.cancel()
        monitoringTimer = null
    }

    /**
     * Get thermal info as WritableMap
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private fun getThermalInfo(): WritableMap {
        val thermalStatus = powerManager?.currentThermalStatus ?: PowerManager.THERMAL_STATUS_NONE
        val statusString = mapThermalStatus(thermalStatus)

        return Arguments.createMap().apply {
            putString("status", statusString)
            putInt("statusCode", thermalStatus)
        }
    }

    /**
     * Map Android thermal status code to our status string
     */
    private fun mapThermalStatus(statusCode: Int): String {
        return when (statusCode) {
            PowerManager.THERMAL_STATUS_NONE -> "nominal"
            PowerManager.THERMAL_STATUS_LIGHT -> "light"
            PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
            PowerManager.THERMAL_STATUS_SEVERE -> "severe"
            PowerManager.THERMAL_STATUS_CRITICAL,
            PowerManager.THERMAL_STATUS_EMERGENCY,
            PowerManager.THERMAL_STATUS_SHUTDOWN -> "critical"
            else -> "nominal"
        }
    }

    /**
     * Send event to JavaScript
     */
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Cleanup when module is destroyed
     */
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        stopMonitoring()
    }
}
