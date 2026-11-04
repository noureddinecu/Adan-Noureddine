package com.noureddine.videodownloader.ads

/**
 * Keeps interstitials respectful:
 * - never during the first [sessionGraceMs] of a session,
 * - at most once per [minIntervalMs],
 * - only on every [everyNth] qualifying event (e.g. a started download),
 * - never while video playback is on screen.
 */
class InterstitialPolicy(
    private val minIntervalMs: Long = 4 * 60_000L,
    private val sessionGraceMs: Long = 60_000L,
    private val everyNth: Int = 2,
) {
    fun shouldShow(
        nowMs: Long,
        sessionStartMs: Long,
        lastShownMs: Long?,
        eventCount: Int,
        playerVisible: Boolean,
    ): Boolean {
        if (playerVisible) return false
        if (nowMs - sessionStartMs < sessionGraceMs) return false
        if (lastShownMs != null && nowMs - lastShownMs < minIntervalMs) return false
        return eventCount > 0 && eventCount % everyNth == 0
    }
}
