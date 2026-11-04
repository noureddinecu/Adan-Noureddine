package com.noureddine.videodownloader.domain

import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.domain.platform.PlatformDetector
import com.noureddine.videodownloader.domain.platform.PlatformPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlatformDetectorTest {

    @Test fun `detects every supported platform including short and mobile hosts`() {
        val cases = mapOf(
            "https://www.facebook.com/watch/?v=123" to Platform.FACEBOOK,
            "https://m.facebook.com/story.php?id=1" to Platform.FACEBOOK,
            "https://fb.watch/abcDEF/" to Platform.FACEBOOK,
            "https://www.tiktok.com/@user/video/7234567890" to Platform.TIKTOK,
            "https://vm.tiktok.com/ZMabc/" to Platform.TIKTOK,
            "https://www.instagram.com/reel/Cxyz/" to Platform.INSTAGRAM,
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ" to Platform.YOUTUBE,
            "https://youtu.be/dQw4w9WgXcQ" to Platform.YOUTUBE,
            "https://m.youtube.com/shorts/abc" to Platform.YOUTUBE,
            "https://x.com/user/status/1" to Platform.X,
            "https://twitter.com/user/status/1" to Platform.X,
            "https://mobile.twitter.com/user/status/1" to Platform.X,
            "https://vimeo.com/76979871" to Platform.VIMEO,
            "https://player.vimeo.com/video/76979871" to Platform.VIMEO,
            "https://cdn.example.com/media/clip.MP4?token=1" to Platform.DIRECT,
            "https://example.com/some/page" to Platform.OTHER,
        )
        cases.forEach { (url, expected) -> assertEquals(url, expected, PlatformDetector.detect(url)) }
    }

    @Test fun `lookalike hosts are not misclassified`() {
        assertEquals(Platform.OTHER, PlatformDetector.detect("https://notfacebook.com/video"))
        assertEquals(Platform.OTHER, PlatformDetector.detect("https://fakeyoutube.com/watch"))
        assertEquals(Platform.OTHER, PlatformDetector.detect("not a url"))
    }

    @Test fun `policy blocks youtube unless explicitly allowed`() {
        assertFalse(PlatformPolicy(allowYouTube = false).isDownloadAllowed(Platform.YOUTUBE))
        assertTrue(PlatformPolicy(allowYouTube = true).isDownloadAllowed(Platform.YOUTUBE))
        Platform.entries.filter { it != Platform.YOUTUBE }.forEach {
            assertTrue(PlatformPolicy(false).isDownloadAllowed(it))
        }
    }
}
