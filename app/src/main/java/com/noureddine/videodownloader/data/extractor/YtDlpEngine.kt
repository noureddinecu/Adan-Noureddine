package com.noureddine.videodownloader.data.extractor

import android.content.Context
import android.util.Log
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.repository.EngineRepository
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owns the lifecycle of the bundled open-source yt-dlp engine (via youtubedl-android).
 * The engine runs fully on-device: no third-party download websites or proxies are used.
 */
@Singleton
class YtDlpEngine @Inject constructor(
    @ApplicationContext private val context: Context,
) : EngineRepository {

    private val mutex = Mutex()
    @Volatile private var ready = false

    override suspend fun ensureReady() {
        if (ready) return
        mutex.withLock {
            if (ready) return
            withContext(Dispatchers.IO) {
                try {
                    YoutubeDL.getInstance().init(context)
                    FFmpeg.getInstance().init(context)
                    ready = true
                } catch (t: Throwable) {
                    Log.e(TAG, "Engine init failed", t)
                    throw AppError.EngineNotReady
                }
            }
        }
    }

    override suspend fun version(): String? = runCatching {
        ensureReady()
        YoutubeDL.getInstance().version(context)
    }.getOrNull()

    override suspend fun update(): Boolean {
        ensureReady()
        return withContext(Dispatchers.IO) {
            try {
                YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel._STABLE) ==
                    YoutubeDL.UpdateStatus.DONE
            } catch (t: Throwable) {
                throw ErrorMapper.map(t)
            }
        }
    }

    private companion object { const val TAG = "YtDlpEngine" }
}
