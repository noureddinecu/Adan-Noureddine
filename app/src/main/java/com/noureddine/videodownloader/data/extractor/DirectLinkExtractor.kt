package com.noureddine.videodownloader.data.extractor

import com.noureddine.videodownloader.core.util.FileNameSanitizer
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.DownloadEngine
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.domain.model.QualityOption
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URI
import java.net.URLDecoder
import javax.inject.Inject
import javax.inject.Singleton

/** Handles plain media file links (…/clip.mp4) with a resumable HTTP download. */
@Singleton
class DirectLinkExtractor @Inject constructor(
    private val client: OkHttpClient,
) : MediaExtractor {

    override fun canHandle(url: String, platform: Platform) = platform == Platform.DIRECT

    override suspend fun extract(url: String, platform: Platform): MediaInfo = withContext(Dispatchers.IO) {
        val (type, length) = try {
            client.newCall(Request.Builder().url(url).head().build()).execute().use { resp ->
                if (resp.code == 404 || resp.code == 410) throw AppError.NotFound
                if (resp.code == 401 || resp.code == 403) throw AppError.LoginRequired
                if (!resp.isSuccessful) throw AppError.Unknown("HTTP ${resp.code}")
                (resp.header("Content-Type") ?: "") to (resp.header("Content-Length")?.toLongOrNull() ?: -1L)
            }
        } catch (t: Throwable) {
            throw ErrorMapper.map(t)
        }
        if (type.isNotBlank() && !type.startsWith("video/") && !type.startsWith("audio/") &&
            !type.startsWith("application/octet-stream")
        ) throw AppError.UnsupportedUrl

        val path = runCatching { URI(url).path }.getOrNull().orEmpty()
        val fileName = URLDecoder.decode(path.substringAfterLast('/'), "UTF-8")
        val ext = fileName.substringAfterLast('.', "mp4").lowercase()
        val isAudio = type.startsWith("audio/") || ext in setOf("mp3", "m4a")
        MediaInfo(
            sourceUrl = url,
            webpageUrl = url,
            title = FileNameSanitizer.sanitize(fileName.substringBeforeLast('.'), "video"),
            uploader = URI(url).host,
            thumbnailUrl = null,
            durationSeconds = 0,
            platform = Platform.DIRECT,
            engine = DownloadEngine.HTTP,
            qualities = listOf(
                QualityOption(
                    id = "original", label = "Original", height = 0, isAudioOnly = isAudio,
                    formatSelector = "", extension = ext, estimatedSize = length.takeIf { it > 0 },
                )
            ),
            downloadAllowed = true,
            directUrl = url,
        )
    }
}
