package com.noureddine.videodownloader.data.repository

import com.noureddine.videodownloader.core.util.UrlUtils
import com.noureddine.videodownloader.data.extractor.DirectLinkExtractor
import com.noureddine.videodownloader.data.extractor.MediaExtractor
import com.noureddine.videodownloader.data.extractor.YouTubeOEmbedExtractor
import com.noureddine.videodownloader.data.extractor.YtDlpExtractor
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.platform.PlatformDetector
import com.noureddine.videodownloader.domain.repository.MediaRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MediaRepositoryImpl @Inject constructor(
    youTube: YouTubeOEmbedExtractor,
    direct: DirectLinkExtractor,
    ytDlp: YtDlpExtractor,
) : MediaRepository {

    /** Ordered: the first extractor that accepts a link handles it. */
    private val extractors: List<MediaExtractor> = listOf(youTube, direct, ytDlp)

    override suspend fun analyze(url: String): MediaInfo {
        val normalized = UrlUtils.extractFirstUrl(url) ?: throw AppError.InvalidUrl
        if (!UrlUtils.isValidHttpUrl(normalized)) throw AppError.InvalidUrl
        val platform = PlatformDetector.detect(normalized)
        val extractor = extractors.firstOrNull { it.canHandle(normalized, platform) }
            ?: throw AppError.UnsupportedUrl
        return extractor.extract(normalized, platform)
    }
}
