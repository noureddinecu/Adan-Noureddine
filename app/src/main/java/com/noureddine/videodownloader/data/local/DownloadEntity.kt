package com.noureddine.videodownloader.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "downloads", indices = [Index("status"), Index("createdAt")])
data class DownloadEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sourceUrl: String,
    val webpageUrl: String,
    val title: String,
    val uploader: String?,
    val thumbnailUrl: String?,
    val durationSeconds: Int,
    val platform: String,
    val engine: String,
    val qualityLabel: String,
    val formatSelector: String,
    val extension: String,
    val isAudioOnly: Boolean,
    val directUrl: String?,
    val status: String,
    val progress: Float = 0f,
    val downloadedBytes: Long = 0,
    val totalBytes: Long = 0,
    val etaSeconds: Long = 0,
    val errorMessage: String? = null,
    val fileUri: String? = null,
    val fileName: String? = null,
    val mimeType: String? = null,
    val fileSize: Long = 0,
    val createdAt: Long,
    val completedAt: Long? = null,
)
