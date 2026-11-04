package com.noureddine.videodownloader.data.download

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.noureddine.videodownloader.data.extractor.ErrorMapper
import com.noureddine.videodownloader.data.local.DownloadDao
import com.noureddine.videodownloader.data.storage.MediaStorage
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.DownloadEngine
import com.noureddine.videodownloader.domain.model.DownloadStatus
import com.noureddine.videodownloader.domain.repository.SettingsRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicReference

@HiltWorker
class DownloadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: DownloadDao,
    private val ytDlp: YtDlpDownloader,
    private val http: HttpDownloader,
    private val storage: MediaStorage,
    private val settings: SettingsRepository,
    private val notifications: DownloadNotifications,
    private val workDirs: WorkDirs,
) : CoroutineWorker(appContext, params) {

    private val downloadId get() = inputData.getLong(KEY_ID, -1)

    override suspend fun doWork(): Result {
        val id = downloadId
        val item = dao.get(id) ?: return Result.failure()
        if (item.status == DownloadStatus.COMPLETED.name || item.status == DownloadStatus.CANCELED.name) {
            return Result.success()
        }
        dao.setStatus(id, DownloadStatus.DOWNLOADING.name)
        runCatching { setForeground(foregroundInfo(item.title, item.progress)) }

        val workDir = workDirs.forId(id)
        val latest = AtomicReference<TransferProgress?>(null)

        return try {
            val file = coroutineScope {
                // Throttled persistence of progress (DB + notification) independent of callback rate.
                val ticker = launch {
                    while (isActive) {
                        delay(600)
                        latest.getAndSet(null)?.let { p ->
                            dao.setProgress(id, p.fraction, p.downloaded, p.total, p.etaSeconds)
                            runCatching { setForeground(foregroundInfo(item.title, p.fraction)) }
                        }
                    }
                }
                val downloader = if (item.engine == DownloadEngine.HTTP.name) http else ytDlp
                val result = downloader.download(item, workDir) { latest.set(it) }
                ticker.cancel()
                result
            }
            val location = settings.settings.first().storageLocation
            val saved = storage.save(file, item.title, location)
            dao.markCompleted(id, saved.uri, saved.displayName, saved.mimeType, saved.size, System.currentTimeMillis())
            workDir.deleteRecursively()
            notifications.finished(id, item.title, success = true)
            Result.success()
        } catch (e: CancellationException) {
            withContext(NonCancellable) {
                when (dao.get(id)?.status) {
                    DownloadStatus.CANCELED.name -> workDir.deleteRecursively()
                    DownloadStatus.DOWNLOADING.name ->
                        // Stopped from the notification or by the system: keep partial data, resumable.
                        dao.setStatus(id, DownloadStatus.PAUSED.name)
                }
            }
            throw e
        } catch (t: Throwable) {
            val error = ErrorMapper.map(t)
            dao.setStatus(id, DownloadStatus.FAILED.name, errorCode(error))
            notifications.finished(id, item.title, success = false)
            Result.failure()
        }
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val item = dao.get(downloadId)
        return foregroundInfo(item?.title ?: "", item?.progress ?: -1f)
    }

    private fun foregroundInfo(title: String, fraction: Float): ForegroundInfo {
        val pause = WorkManager.getInstance(applicationContext).createCancelPendingIntent(id)
        val notification = notifications.progress(title, fraction, pause)
        val nid = DownloadNotifications.progressId(downloadId)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(nid, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else ForegroundInfo(nid, notification)
    }

    companion object {
        const val KEY_ID = "download_id"

        /** Persisted error codes; the UI maps them back to localized messages. */
        fun errorCode(e: AppError): String = when (e) {
            is AppError.Unknown -> "UNKNOWN:" + (e.detail ?: "")
            else -> e::class.simpleName ?: "UNKNOWN"
        }
    }
}
