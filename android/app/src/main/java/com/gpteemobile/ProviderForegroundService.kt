package com.gpteemobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ProviderForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "gptee_provider_channel"
        private const val NOTIFICATION_ID = 1
        const val ACTION_START = "com.gpteemobile.ACTION_START_PROVIDER"
        const val ACTION_STOP = "com.gpteemobile.ACTION_STOP_PROVIDER"
        const val ACTION_UPDATE = "UPDATE_NOTIFICATION"

        fun startService(context: Context) {
            val intent = Intent(context, ProviderForegroundService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, ProviderForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.stopService(intent)
        }
    }

    private var currentTitle = "GPTee Active"
    private var currentDesc = "Starting..."
    private var isRunning = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                currentTitle = intent.getStringExtra("taskTitle") ?: "GPTee Active"
                currentDesc = intent.getStringExtra("taskDesc") ?: "Starting..."
                val notification = createNotification(currentTitle, currentDesc)
                startForeground(NOTIFICATION_ID, notification)
                isRunning = true
            }
            ACTION_UPDATE -> {
                if (isRunning) {
                    currentTitle = intent.getStringExtra("taskTitle") ?: currentTitle
                    currentDesc = intent.getStringExtra("taskDesc") ?: currentDesc
                    val notification = createNotification(currentTitle, currentDesc)
                    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    notificationManager.notify(NOTIFICATION_ID, notification)
                }
            }
            ACTION_STOP -> {
                isRunning = false
                stopForeground(true)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "GPTee Provider Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the provider running in the background"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(title: String, desc: String): Notification {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(desc)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setColor(0x27c93f)
            .build()
    }
}
