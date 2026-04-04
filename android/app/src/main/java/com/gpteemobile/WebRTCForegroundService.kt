package com.gpteemobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * WebRTCForegroundService
 *
 * MINIMAL foreground service that keeps the app process alive.
 *
 * Purpose:
 * - Keep process alive when app is backgrounded
 * - Keep process alive when app is removed from recents
 * - JavaScript runtime continues running
 * - WebRTC connections stay active
 *
 * This service does NOT manage WebSocket or WebRTC directly.
 * It just prevents Android from killing the process.
 * JavaScript RelayClient and WebRTCClient handle the actual P2P logic.
 */
class WebRTCForegroundService : Service() {

    companion object {
        private const val TAG = "WebRTCForegroundService"
        private const val NOTIFICATION_ID = 12345
        private const val CHANNEL_ID = "gptee_webrtc_channel"

        const val ACTION_START_SERVICE = "com.gpteemobile.START_WEBRTC_SERVICE"
        const val ACTION_STOP_SERVICE = "com.gpteemobile.STOP_WEBRTC_SERVICE"

        const val EXTRA_TITLE = "title"
        const val EXTRA_MESSAGE = "message"

        /**
         * Start the foreground service
         */
        fun start(context: Context, title: String, message: String) {
            val intent = Intent(context, WebRTCForegroundService::class.java).apply {
                action = ACTION_START_SERVICE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_MESSAGE, message)
            }
            context.startForegroundService(intent)
        }

        /**
         * Stop the foreground service
         */
        fun stop(context: Context) {
            val intent = Intent(context, WebRTCForegroundService::class.java).apply {
                action = ACTION_STOP_SERVICE
            }
            context.startService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var currentTitle: String = "Provider Mode"
    private var currentMessage: String = "Ready"

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")

        // Create notification channel
        createNotificationChannel()

        // Acquire CPU wake lock to prevent doze
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "GPTee::WebRTCWakeLock"
        ).apply {
            setReferenceCounted(false)
            acquire()
        }

        Log.d(TAG, "Wake lock acquired")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SERVICE -> {
                currentTitle = intent.getStringExtra(EXTRA_TITLE) ?: "Provider Mode"
                currentMessage = intent.getStringExtra(EXTRA_MESSAGE) ?: "Ready"

                Log.d(TAG, "Starting foreground service: $currentTitle")

                // Start foreground with notification
                // This keeps the Android process alive, which keeps React Native runtime loaded
                // WebSocket and WebRTC connections persist automatically
                startForeground(NOTIFICATION_ID, createNotification(currentTitle, currentMessage))

                Log.d(TAG, "✅ Foreground service active - process will persist in background")
            }

            ACTION_STOP_SERVICE -> {
                Log.d(TAG, "Stopping service")

                stopForeground(true)
                stopSelf()
            }
        }

        // START_STICKY ensures service restarts if killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        Log.d(TAG, "Service destroyed")

        // Release wake lock
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wakeLock = null

        super.onDestroy()
    }

    /**
     * Called when app is removed from recent apps
     * Restart service to keep it alive (like WhatsApp, Telegram, etc.)
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.d(TAG, "⚠️ App removed from recent apps - scheduling restart")

        // Schedule restart using exact alarm (required for Android 12+)
        val restartIntent = Intent(applicationContext, WebRTCForegroundService::class.java).apply {
            action = ACTION_START_SERVICE
            putExtra(EXTRA_TITLE, currentTitle)
            putExtra(EXTRA_MESSAGE, currentMessage)
        }

        val pendingIntent = PendingIntent.getService(
            this,
            1,
            restartIntent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmManager = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
        val triggerTime = System.currentTimeMillis() + 1000

        try {
            // Use setExactAndAllowWhileIdle for better reliability (works even in Doze mode)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    android.app.AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            } else {
                alarmManager.setExact(
                    android.app.AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            }
            Log.d(TAG, "✅ Service restart scheduled for ${triggerTime}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to schedule restart: ${e.message}")
        }

        super.onTaskRemoved(rootIntent)
    }

    /**
     * Create notification channel (required for Android 8+)
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "GPTee Provider Mode",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps provider mode running in background"
                setShowBadge(false)
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    /**
     * Create notification for foreground service
     * Designed to be informative like Google Maps notifications
     */
    private fun createNotification(title: String, message: String): Notification {
        // Intent to open app when notification is tapped
        val notificationIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth) // Use Bluetooth icon to indicate P2P
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setShowWhen(false) // Don't show timestamp
            .setColor(0xFF4CAF50.toInt()) // Green for active/connected state
            .setColorized(true) // Make notification colorful like Google Maps
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    /**
     * Update notification text
     */
    fun updateNotification(title: String, message: String) {
        currentTitle = title
        currentMessage = message

        val notification = createNotification(title, message)
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }
}
