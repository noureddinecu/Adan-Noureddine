package com.noureddine.videodownloader.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE id = :id")
    fun observe(id: Long): Flow<DownloadEntity?>

    @Query("SELECT * FROM downloads WHERE id = :id")
    suspend fun get(id: Long): DownloadEntity?

    @Insert
    suspend fun insert(entity: DownloadEntity): Long

    @Update
    suspend fun update(entity: DownloadEntity)

    @Query("UPDATE downloads SET status = :status, errorMessage = :error WHERE id = :id")
    suspend fun setStatus(id: Long, status: String, error: String? = null)

    @Query(
        "UPDATE downloads SET progress = :progress, downloadedBytes = :downloaded, " +
            "totalBytes = :total, etaSeconds = :eta WHERE id = :id"
    )
    suspend fun setProgress(id: Long, progress: Float, downloaded: Long, total: Long, eta: Long)

    @Query(
        "UPDATE downloads SET status = 'COMPLETED', progress = 1, fileUri = :uri, fileName = :name, " +
            "mimeType = :mime, fileSize = :size, completedAt = :completedAt, errorMessage = NULL WHERE id = :id"
    )
    suspend fun markCompleted(id: Long, uri: String, name: String, mime: String, size: Long, completedAt: Long)

    @Query("UPDATE downloads SET fileUri = :uri, fileName = :name, title = :title WHERE id = :id")
    suspend fun updateFile(id: Long, uri: String, name: String, title: String)

    @Query("DELETE FROM downloads WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("DELETE FROM downloads WHERE status IN ('FAILED', 'CANCELED')")
    suspend fun deleteInactive()
}
