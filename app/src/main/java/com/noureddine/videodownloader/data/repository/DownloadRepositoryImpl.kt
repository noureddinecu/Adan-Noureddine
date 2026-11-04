package com.noureddine.videodownloader.data.repository

import com.noureddine.videodownloader.data.download.DownloadScheduler
import com.noureddine.videodownloader.data.download.WorkDirs
import com.noureddine.videodownloader.data.download.YtDlpDownloader
import com.noureddine.videodownloader.data.local.DownloadDao
import com.noureddine.videodownloader.data.local.DownloadEntity
import com.noureddine.videodownloader.data.local.toDomain
import com.noureddine.videodownloader.data.storage.MediaStorage
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.DownloadStatus
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.model.QualityOption
import com.noureddine.videodownloader.domain.repository.DownloadRepository
import com.noureddine.videodownloader.domain.repository.SettingsRepository
import com.yausername.youtubedl_android.YoutubeDL
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DownloadRepositoryImpl @Inject constructor(
    private val dao: DownloadDao,
    private val scheduler: DownloadScheduler,
    private val storage: MediaStorage,
    private val settings: SettingsRepository,
    private val workDirs: WorkDirs,
) : DownloadRepository {

    override fun observeAll(): Flow<List<DownloadItem>> = dao.observeAll().map { list -> list.map { it.toDomain() } }

    override fun observe(id: Long): Flow<DownloadItem?> = dao.observe(id).map { it?.toDomain() }

    override suspend fun get(id: Long): DownloadItem? = dao.get(id)?.toDomain()

    override suspend fun enqueue(info: MediaInfo, quality: QualityOption): Long {
        if (!info.downloadAllowed) throw AppError.PolicyBlocked
        val id = dao.insert(
            DownloadEntity(
                sourceUrl = info.sourceUrl,
                webpageUrl = info.webpageUrl,
                title = info.title,
                uploader = info.uploader,
                thumbnailUrl = info.thumbnailUrl,
                durationSeconds = info.durationSeconds,
                platform = info.platform.name,
                engine = info.engine.name,
                qualityLabel = quality.label,
                formatSelector = quality.formatSelector,
                extension = quality.extension,
                isAudioOnly = quality.isAudioOnly,
                directUrl = info.directUrl,
                status = DownloadStatus.QUEUED.name,
                totalBytes = quality.estimatedSize ?: 0,
                createdAt = System.currentTimeMillis(),
            )
        )
        scheduler.schedule(id, settings.settings.first().wifiOnly)
        return id
    }

    override suspend fun pause(id: Long) {
        val item = dao.get(id) ?: return
        if (item.status != DownloadStatus.DOWNLOADING.name && item.status != DownloadStatus.QUEUED.name) return
        dao.setStatus(id, DownloadStatus.PAUSED.name)
        scheduler.cancel(id)
        YoutubeDL.getInstance().destroyProcessById(YtDlpDownloader.processId(id))
    }

    override suspend fun resume(id: Long) {
        val item = dao.get(id) ?: return
        if (item.status == DownloadStatus.COMPLETED.name || item.status == DownloadStatus.DOWNLOADING.name) return
        dao.setStatus(id, DownloadStatus.QUEUED.name)
        scheduler.schedule(id, settings.settings.first().wifiOnly)
    }

    override suspend fun cancel(id: Long) {
        dao.setStatus(id, DownloadStatus.CANCELED.name)
        scheduler.cancel(id)
        YoutubeDL.getInstance().destroyProcessById(YtDlpDownloader.processId(id))
        workDirs.delete(id)
    }

    override suspend fun delete(id: Long, deleteFile: Boolean): Boolean {
        val item = dao.get(id) ?: return false
        if (item.status == DownloadStatus.DOWNLOADING.name || item.status == DownloadStatus.QUEUED.name) cancel(id)
        var ok = true
        if (deleteFile && item.fileUri != null) ok = storage.delete(item.fileUri)
        workDirs.delete(id)
        dao.delete(id)
        return ok
    }

    override suspend fun rename(id: Long, newBaseName: String): Boolean {
        val item = dao.get(id) ?: return false
        val uri = item.fileUri ?: return false
        if (newBaseName.isBlank()) return false
        val (newUri, newName) = storage.rename(uri, newBaseName) ?: return false
        dao.updateFile(id, newUri, newName, newName.substringBeforeLast('.'))
        return true
    }

    override suspend fun clearInactiveHistory() = dao.deleteInactive()
}
