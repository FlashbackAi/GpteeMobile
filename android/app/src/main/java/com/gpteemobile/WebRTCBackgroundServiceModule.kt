package com.gpteemobile

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * WebRTCBackgroundServiceModule
 *
 * React Native bridge to control the WebRTC foreground service.
 *
 * This module provides a simple API to start/stop a foreground service
 * that keeps the JavaScript runtime alive for WebRTC connections.
 */
class WebRTCBackgroundServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "WebRTCBackgroundServiceModule"
    }

    override fun getName(): String {
        return "WebRTCBackgroundServiceModule"
    }

    /**
     * Start foreground service with notification
     * This keeps the process alive so JavaScript WebRTC can continue running
     */
    @ReactMethod
    fun startForegroundService(title: String, message: String, promise: Promise) {
        try {
            Log.d(TAG, "Starting foreground service: $title")
            WebRTCForegroundService.start(reactApplicationContext, title, message)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting foreground service", e)
            promise.reject("ERROR", "Failed to start service: ${e.message}")
        }
    }

    /**
     * Stop foreground service
     */
    @ReactMethod
    fun stopForegroundService(promise: Promise) {
        try {
            Log.d(TAG, "Stopping foreground service")
            WebRTCForegroundService.stop(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping foreground service", e)
            promise.reject("ERROR", "Failed to stop service: ${e.message}")
        }
    }
}
