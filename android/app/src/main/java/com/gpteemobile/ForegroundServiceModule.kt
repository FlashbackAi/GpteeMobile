package com.gpteemobile

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class ForegroundServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "ForegroundServiceModule"
    }

    @ReactMethod
    fun startService(options: ReadableMap, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, ProviderForegroundService::class.java)

            // Pass options to service
            if (options.hasKey("taskTitle")) {
                intent.putExtra("taskTitle", options.getString("taskTitle"))
            }
            if (options.hasKey("taskDesc")) {
                intent.putExtra("taskDesc", options.getString("taskDesc"))
            }
            if (options.hasKey("mode")) {
                intent.putExtra("mode", options.getString("mode"))
            }

            reactApplicationContext.startForegroundService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", "Failed to start foreground service: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, ProviderForegroundService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", "Failed to stop foreground service: ${e.message}", e)
        }
    }

    @ReactMethod
    fun updateNotification(options: ReadableMap, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, ProviderForegroundService::class.java)
            intent.action = "UPDATE_NOTIFICATION"

            if (options.hasKey("taskTitle")) {
                intent.putExtra("taskTitle", options.getString("taskTitle"))
            }
            if (options.hasKey("taskDesc")) {
                intent.putExtra("taskDesc", options.getString("taskDesc"))
            }

            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_NOTIFICATION_ERROR", "Failed to update notification: ${e.message}", e)
        }
    }
}
