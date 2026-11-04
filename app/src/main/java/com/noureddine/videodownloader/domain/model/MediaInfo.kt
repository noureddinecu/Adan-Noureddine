package com.noureddine.videodownloader.domain.model

/** Which component performs the actual transfer. */
enum class DownloadEngine { YTDLP, HTTP }

/** A downloadable variant offered to the user. */
data class QualityOption(
    val id: String,
    /** e.g. "1080p", "Audio". */
    val label: String,
    /** Video height in px; 0 for audio-only / unknown. */
    val height: Int,
    val isAudioOnly: Boolean,
    /** yt-dlp `-f` selector (ignored by the HTTP engine). */
    val formatSelector: String,
    val extension: String,
    /** Estimated size in bytes, or null when the source doesn't advertise it. */
    val estimatedSize: Long?,
)

/** Result of analysing a link. */
data class MediaInfo(
    val sourceUrl: String,
    val webpageUrl: String,
    val title: String,
    val uploader: String?,
    val thumbnailUrl: String?,
    val durationSeconds: Int,
    val platform: Platform,
    val engine: DownloadEngine,
    val qualities: List<QualityOption>,
    /** False when platform policy prohibits downloading (see [com.noureddine.videodownloader.domain.platform.PlatformPolicy]). */
    val downloadAllowed: Boolean,
    /** Direct media URL for the HTTP engine. */
    val directUrl: String? = null,
)
