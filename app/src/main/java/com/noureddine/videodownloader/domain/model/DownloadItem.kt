package com.noureddine.videodownloader.domain.model

enum class DownloadStatus {
    QUEUED, DOWNLOADING, PAUSED, COMPLETED, FAILED, CANCELED;

    val isActive get() = this == QUEUED || this == DOWNLOADING
    val isResumable get() = this == PAUSED || this == FAILED
}

data class DownloadItem(
    val id: Long,
    val sourceUrl: String,
    val title: String,
    val uploader: String?,
    val thumbnailUrl: String?,
    val durationSeconds: Int,
    val platform: Platform,
    val qualityLabel: String,
    val isAudioOnly: Boolean,
    val status: DownloadStatus,
    /** 0f..1f, or -1f when indeterminate. */
    val progress: Float,
    val downloadedBytes: Long,
    val totalBytes: Long,
    val etaSeconds: Long,
    val errorMessage: String?,
    val fileUri: String?,
    val fileName: String?,
    val mimeType: String?,
    val fileSize: Long,
    val createdAt: Long,
    val completedAt: Long?,
    val engine: DownloadEngine,
)
