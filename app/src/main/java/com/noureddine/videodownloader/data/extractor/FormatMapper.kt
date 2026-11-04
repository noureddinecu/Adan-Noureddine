package com.noureddine.videodownloader.data.extractor

import com.noureddine.videodownloader.domain.model.PreferredQuality
import com.noureddine.videodownloader.domain.model.QualityOption

/** Engine-agnostic description of one stream reported by the extractor. */
data class RawFormat(
    val formatId: String,
    val ext: String?,
    val height: Int,
    val vcodec: String?,
    val acodec: String?,
    val fileSize: Long,
    val tbrKbps: Int = 0,
) {
    val hasVideo get() = !vcodec.isNullOrBlank() && vcodec != "none"
    val hasAudio get() = !acodec.isNullOrBlank() && acodec != "none"
    val isAudioOnly get() = hasAudio && !hasVideo
}

/**
 * Turns the raw stream list into a short, user-friendly set of choices:
 * one option per distinct resolution (descending) plus an audio-only option.
 * Selectors fall back gracefully so a choice never fails just because a site
 * serves muxed streams only.
 */
object FormatMapper {

    const val BEST_ID = "best"
    const val AUDIO_ID = "audio"

    fun map(formats: List<RawFormat>, durationSeconds: Int): List<QualityOption> {
        val video = formats.filter { it.hasVideo && it.height > 0 }
        val audio = formats.filter { it.isAudioOnly }
        val bestAudioSize = audio.maxOfOrNull { size(it, durationSeconds) ?: 0L }?.takeIf { it > 0 }

        val options = mutableListOf<QualityOption>()
        val heights = video.map { it.height }.distinct().sortedDescending()

        if (heights.isEmpty()) {
            options += QualityOption(
                id = BEST_ID, label = "Best", height = 0, isAudioOnly = false,
                formatSelector = "bv*+ba/b", extension = "mp4",
                estimatedSize = formats.mapNotNull { size(it, durationSeconds) }.maxOrNull(),
            )
        } else {
            heights.forEach { h ->
                val candidates = video.filter { it.height == h }
                val best = candidates.maxByOrNull { size(it, durationSeconds) ?: 0L }!!
                val videoSize = size(best, durationSeconds)
                val total = when {
                    videoSize == null -> null
                    best.hasAudio -> videoSize
                    else -> videoSize + (bestAudioSize ?: 0L)
                }
                options += QualityOption(
                    id = "h$h",
                    label = label(h),
                    height = h,
                    isAudioOnly = false,
                    formatSelector = "bv*[height<=$h]+ba/b[height<=$h]/bv*+ba/b",
                    extension = "mp4",
                    estimatedSize = total,
                )
            }
        }

        if (audio.isNotEmpty()) {
            val m4a = audio.any { it.ext == "m4a" }
            options += QualityOption(
                id = AUDIO_ID, label = "Audio", height = 0, isAudioOnly = true,
                formatSelector = "ba[ext=m4a]/ba",
                extension = if (m4a) "m4a" else (audio.first().ext ?: "m4a"),
                estimatedSize = bestAudioSize,
            )
        }
        return options
    }

    /** Picks the option that best matches the user's preference. */
    fun pickDefault(options: List<QualityOption>, preferred: PreferredQuality): QualityOption? {
        if (options.isEmpty()) return null
        if (preferred == PreferredQuality.AUDIO) {
            return options.firstOrNull { it.isAudioOnly } ?: options.first()
        }
        val videos = options.filterNot { it.isAudioOnly }
        if (videos.isEmpty()) return options.first()
        return videos.firstOrNull { it.height in 1..preferred.maxHeight } ?: videos.last()
    }

    fun label(height: Int): String = when {
        height >= 4320 -> "8K"
        height >= 2160 -> "4K"
        height >= 1440 -> "1440p"
        else -> "${height}p"
    }

    private fun size(f: RawFormat, durationSeconds: Int): Long? = when {
        f.fileSize > 0 -> f.fileSize
        f.tbrKbps > 0 && durationSeconds > 0 -> f.tbrKbps.toLong() * 1000 / 8 * durationSeconds
        else -> null
    }
}
