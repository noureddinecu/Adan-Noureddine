package com.noureddine.videodownloader.domain.platform

import com.noureddine.videodownloader.domain.model.Platform
import java.net.URI

object PlatformDetector {

    private val hosts: Map<Platform, List<String>> = mapOf(
        Platform.FACEBOOK to listOf("facebook.com", "fb.watch", "fb.com"),
        Platform.TIKTOK to listOf("tiktok.com"),
        Platform.INSTAGRAM to listOf("instagram.com", "instagr.am"),
        Platform.YOUTUBE to listOf("youtube.com", "youtu.be", "youtube-nocookie.com"),
        Platform.X to listOf("x.com", "twitter.com"),
        Platform.VIMEO to listOf("vimeo.com"),
    )

    private val directExtensions = setOf("mp4", "m4v", "webm", "mkv", "mov", "3gp", "m4a", "mp3")

    fun detect(url: String): Platform {
        val uri = runCatching { URI(url.trim()) }.getOrNull() ?: return Platform.OTHER
        val host = uri.host?.lowercase()?.removePrefix("www.") ?: return Platform.OTHER
        hosts.forEach { (platform, domains) ->
            if (domains.any { host == it || host.endsWith(".$it") }) return platform
        }
        val ext = uri.path.orEmpty().substringAfterLast('/').substringAfterLast('.', "").lowercase()
        if (ext in directExtensions) return Platform.DIRECT
        return Platform.OTHER
    }
}
