package com.noureddine.videodownloader.ads

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InterstitialPolicyTest {
    private val policy = InterstitialPolicy(minIntervalMs = 240_000, sessionGraceMs = 60_000, everyNth = 2)

    @Test fun `never shows during grace period`() =
        assertFalse(policy.shouldShow(30_000, 0, null, 2, playerVisible = false))

    @Test fun `never shows while player is visible`() =
        assertFalse(policy.shouldShow(600_000, 0, null, 2, playerVisible = true))

    @Test fun `only every nth event`() {
        assertFalse(policy.shouldShow(600_000, 0, null, 1, false))
        assertTrue(policy.shouldShow(600_000, 0, null, 2, false))
    }

    @Test fun `respects minimum interval`() {
        assertFalse(policy.shouldShow(600_000, 0, 500_000, 4, false))
        assertTrue(policy.shouldShow(800_000, 0, 500_000, 4, false))
    }
}
