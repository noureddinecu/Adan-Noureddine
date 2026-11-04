package com.noureddine.videodownloader.domain.repository

import com.noureddine.videodownloader.domain.model.AppSettings
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.model.PreferredQuality
import com.noureddine.videodownloader.domain.model.QualityOption
import com.noureddine.videodownloader.domain.model.StorageLocation
import com.noureddine.videodownloader.domain.model.ThemeMode
import kotlinx.coroutines.flow.Flow

interface MediaRepository {
    /** Resolves a link into metadata + available qualities. Throws [com.noureddine.videodownloader.domain.model.AppError]. */
    suspend fun analyze(url: String): MediaInfo
}

interface DownloadRepository {
    fun observeAll(): Flow<List<DownloadItem>>
    fun observe(id: Long): Flow<DownloadItem?>
    suspend fun get(id: Long): DownloadItem?
    suspend fun enqueue(info: MediaInfo, quality: QualityOption): Long
    suspend fun pause(id: Long)
    suspend fun resume(id: Long)
    suspend fun cancel(id: Long)
    suspend fun retry(id: Long) = resume(id)
    /** Removes the record; when [deleteFile] also deletes the saved media. */
    suspend fun delete(id: Long, deleteFile: Boolean): Boolean
    suspend fun rename(id: Long, newBaseName: String): Boolean
    suspend fun clearInactiveHistory()
}

interface SettingsRepository {
    val settings: Flow<AppSettings>
    suspend fun setThemeMode(mode: ThemeMode)
    suspend fun setDynamicColor(enabled: Boolean)
    suspend fun setStorageLocation(location: StorageLocation)
    suspend fun setPreferredQuality(quality: PreferredQuality)
    suspend fun setWifiOnly(enabled: Boolean)
}

interface EngineRepository {
    suspend fun ensureReady()
    suspend fun version(): String?
    /** @return true if a new version was installed. */
    suspend fun update(): Boolean
}
