package com.noureddine.videodownloader.data.local

import com.noureddine.videodownloader.domain.model.DownloadEngine
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.DownloadStatus
import com.noureddine.videodownloader.domain.model.Platform

fun DownloadEntity.toDomain() = DownloadItem(
    id = id,
    sourceUrl = sourceUrl,
    title = title,
    uploader = uploader,
    thumbnailUrl = thumbnailUrl,
    durationSeconds = durationSeconds,
    platform = Platform.fromName(platform),
    qualityLabel = qualityLabel,
    isAudioOnly = isAudioOnly,
    status = runCatching { DownloadStatus.valueOf(status) }.getOrDefault(DownloadStatus.FAILED),
    progress = progress,
    downloadedBytes = downloadedBytes,
    totalBytes = totalBytes,
    etaSeconds = etaSeconds,
    errorMessage = errorMessage,
    fileUri = fileUri,
    fileName = fileName,
    mimeType = mimeType,
    fileSize = fileSize,
    createdAt = createdAt,
    completedAt = completedAt,
    engine = runCatching { DownloadEngine.valueOf(engine) }.getOrDefault(DownloadEngine.YTDLP),
)
