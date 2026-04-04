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
            val title = options.getString("taskTitle") ?: "Provider Mode"
            val message = options.getString("taskDesc") ?: "Running in background"

            WebRTCForegroundService.start(reactApplicationContext, title, message)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", "Failed to start foreground service: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            WebRTCForegroundService.stop(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", "Failed to stop foreground service: ${e.message}", e)
        }
    }

    @ReactMethod
    fun updateNotification(options: ReadableMap, promise: Promise) {
        try {
            // Note: WebRTCForegroundService doesn't support updateNotification directly
            // Would need to stop and restart with new parameters
            val title = options.getString("taskTitle") ?: "Provider Mode"
            val message = options.getString("taskDesc") ?: "Running in background"

            WebRTCForegroundService.start(reactApplicationContext, title, message)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_NOTIFICATION_ERROR", "Failed to update notification: ${e.message}", e)
        }
    }
}
