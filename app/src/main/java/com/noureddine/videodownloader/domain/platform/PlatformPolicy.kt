package com.noureddine.videodownloader.domain.platform

import com.noureddine.videodownloader.domain.model.Platform

/**
 * Central place for legal/compliance decisions about each source.
 *
 * - YouTube: its Terms of Service do not permit downloading except through YouTube's own
 *   features (e.g. Premium offline), and Google Play rejects apps that download YouTube content.
 *   The app therefore shows the video's info but routes the user to the official app.
 * - All other sources: only publicly accessible media is supported; no login, cookie import,
 *   DRM circumvention or paywall bypass is ever performed.
 */
class PlatformPolicy(private val allowYouTube: Boolean) {
    fun isDownloadAllowed(platform: Platform): Boolean = when (platform) {
        Platform.YOUTUBE -> allowYouTube
        else -> true
    }
}
