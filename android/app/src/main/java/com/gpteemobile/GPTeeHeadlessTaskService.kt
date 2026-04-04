package com.gpteemobile

import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Headless JS Task Service
 *
 * Keeps React Native JavaScript runtime alive when app is in background or killed.
 * This allows WebSocket (RelayClient) and WebRTC connections to persist.
 */
class GPTeeHeadlessTaskService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras: Bundle? = intent?.extras

        return if (extras != null) {
            val data = Arguments.fromBundle(extras)
            Log.d(TAG, "Starting GPTee headless task with data: $data")

            HeadlessJsTaskConfig(
                "GPTeeBackgroundTask",  // Task name registered in index.js
                data,
                0,  // Timeout (0 = no timeout, runs indefinitely)
                true  // Allow task in foreground
            )
        } else {
            Log.w(TAG, "No extras provided to headless task")
            null
        }
    }

    companion object {
        private const val TAG = "GPTeeHeadlessTask"
    }
}
