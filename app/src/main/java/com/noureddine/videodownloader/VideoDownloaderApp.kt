package com.noureddine.videodownloader

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.noureddine.videodownloader.data.download.DownloadNotifications
import com.noureddine.videodownloader.domain.repository.EngineRepository
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class VideoDownloaderApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var engine: EngineRepository
    @Inject lateinit var notifications: DownloadNotifications

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        notifications.ensureChannels()
        // Warm up the engine (first launch unpacks Python + yt-dlp, a few seconds).
        appScope.launch { runCatching { engine.ensureReady() } }
    }
}
