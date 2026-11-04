package com.noureddine.videodownloader.data.extractor

import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.DownloadEngine
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.domain.platform.PlatformPolicy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads public YouTube metadata through YouTube's official oEmbed endpoint.
 * Used while YouTube downloading is disabled by [PlatformPolicy]: the user sees the video
 * card and is offered to open it in the official YouTube app instead.
 */
@Singleton
class YouTubeOEmbedExtractor @Inject constructor(
    private val client: OkHttpClient,
    private val policy: PlatformPolicy,
) : MediaExtractor {

    override fun canHandle(url: String, platform: Platform) =
        platform == Platform.YOUTUBE && !policy.isDownloadAllowed(Platform.YOUTUBE)

    override suspend fun extract(url: String, platform: Platform): MediaInfo = withContext(Dispatchers.IO) {
        val endpoint = "https://www.youtube.com/oembed".toHttpUrl().newBuilder()
            .addQueryParameter("url", url)
            .addQueryParameter("format", "json")
            .build()
        val body = try {
            client.newCall(Request.Builder().url(endpoint).build()).execute().use { resp ->
                when {
                    resp.code == 401 || resp.code == 403 -> throw AppError.LoginRequired
                    resp.code == 404 || resp.code == 400 -> throw AppError.NotFound
                    !resp.isSuccessful -> throw AppError.Unknown("HTTP ${resp.code}")
                }
                resp.body?.string().orEmpty()
            }
        } catch (t: Throwable) {
            throw ErrorMapper.map(t)
        }
        val json = runCatching { JSONObject(body) }.getOrElse { throw AppError.NotFound }
        MediaInfo(
            sourceUrl = url,
            webpageUrl = url,
            title = json.optString("title").ifBlank { "YouTube" },
            uploader = json.optString("author_name").ifBlank { null },
            thumbnailUrl = json.optString("thumbnail_url").ifBlank { null },
            durationSeconds = 0,
            platform = Platform.YOUTUBE,
            engine = DownloadEngine.YTDLP,
            qualities = emptyList(),
            downloadAllowed = false,
        )
    }
}
