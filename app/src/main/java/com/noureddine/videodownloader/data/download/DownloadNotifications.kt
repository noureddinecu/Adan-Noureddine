package com.noureddine.videodownloader.data.download

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.noureddine.videodownloader.MainActivity
import com.noureddine.videodownloader.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DownloadNotifications @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_PROGRESS, context.getString(R.string.channel_progress), NotificationManager.IMPORTANCE_LOW)
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_DONE, context.getString(R.string.channel_done), NotificationManager.IMPORTANCE_DEFAULT)
        )
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        context, 0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun progress(title: String, fraction: Float, pauseIntent: PendingIntent?): Notification {
        ensureChannels()
        val percent = (fraction * 100).toInt()
        return NotificationCompat.Builder(context, CHANNEL_PROGRESS)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(if (fraction >= 0) "$percent%" else context.getString(R.string.status_downloading))
            .setProgress(100, percent.coerceAtLeast(0), fraction < 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openAppIntent())
            .apply {
                if (pauseIntent != null) addAction(0, context.getString(R.string.action_pause), pauseIntent)
            }
            .build()
    }

    fun finished(id: Long, title: String, success: Boolean) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return
        ensureChannels()
        val n = NotificationCompat.Builder(context, CHANNEL_DONE)
            .setSmallIcon(if (success) android.R.drawable.stat_sys_download_done else android.R.drawable.stat_notify_error)
            .setContentTitle(context.getString(if (success) R.string.notif_done else R.string.notif_failed))
            .setContentText(title)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent())
            .build()
        NotificationManagerCompat.from(context).notify(DONE_BASE + id.toInt(), n)
    }

    companion object {
        const val CHANNEL_PROGRESS = "downloads_progress"
        const val CHANNEL_DONE = "downloads_done"
        const val DONE_BASE = 100_000
        fun progressId(id: Long) = 1_000 + id.toInt()
    }
}
