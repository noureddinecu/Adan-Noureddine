package com.noureddine.videodownloader.data.extractor

import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.DownloadEngine
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.domain.platform.PlatformPolicy
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class YtDlpExtractor @Inject constructor(
    private val engine: YtDlpEngine,
    private val policy: PlatformPolicy,
) : MediaExtractor {

    override fun canHandle(url: String, platform: Platform) = platform != Platform.DIRECT

    override suspend fun extract(url: String, platform: Platform): MediaInfo {
        engine.ensureReady()
        val info = try {
            runInterruptible(Dispatchers.IO) {
                val request = YoutubeDLRequest(url).apply {
                    addOption("--no-playlist")
                    addOption("--socket-timeout", 20)
                }
                YoutubeDL.getInstance().getInfo(request)
            }
        } catch (t: Throwable) {
            throw ErrorMapper.map(t)
        }

        val raw = info.formats.orEmpty().map {
            RawFormat(
                formatId = it.formatId.orEmpty(),
                ext = it.ext,
                height = it.height,
                vcodec = it.vcodec,
                acodec = it.acodec,
                fileSize = if (it.fileSize > 0) it.fileSize else it.fileSizeApproximate,
                tbrKbps = it.tbr,
            )
        }
        val qualities = FormatMapper.map(raw, info.duration)
        if (qualities.isEmpty()) throw AppError.NoFormats

        return MediaInfo(
            sourceUrl = url,
            webpageUrl = info.webpageUrl ?: url,
            title = info.title?.takeIf { it.isNotBlank() } ?: info.fulltitle ?: "Video",
            uploader = info.uploader,
            thumbnailUrl = info.thumbnail ?: info.thumbnails?.lastOrNull()?.url,
            durationSeconds = info.duration,
            platform = platform,
            engine = DownloadEngine.YTDLP,
            qualities = qualities,
            downloadAllowed = policy.isDownloadAllowed(platform),
        )
    }
}
