package com.noureddine.videodownloader.core

import com.noureddine.videodownloader.core.util.DateBucket
import com.noureddine.videodownloader.core.util.DateBuckets
import com.noureddine.videodownloader.core.util.FileNameSanitizer
import com.noureddine.videodownloader.core.util.Formatters
import com.noureddine.videodownloader.core.util.UrlUtils
import com.noureddine.videodownloader.data.download.ProgressParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class UtilsTest {

    @Test fun `extracts url from shared text`() {
        assertEquals(
            "https://vm.tiktok.com/ZMabc/",
            UrlUtils.extractFirstUrl("Check this out! https://vm.tiktok.com/ZMabc/ #fun"),
        )
        assertEquals("https://www.instagram.com/reel/x", UrlUtils.extractFirstUrl("www.instagram.com/reel/x."))
        assertNull(UrlUtils.extractFirstUrl("no links here"))
        assertNull(UrlUtils.extractFirstUrl(null))
    }

    @Test fun `validates http urls`() {
        assertTrue(UrlUtils.isValidHttpUrl("https://x.com/a/status/1"))
        assertFalse(UrlUtils.isValidHttpUrl("ftp://x.com/file"))
        assertFalse(UrlUtils.isValidHttpUrl("https://localhost"))
        assertFalse(UrlUtils.isValidHttpUrl("hello"))
    }

    @Test fun `sanitizes file names but keeps arabic`() {
        assertEquals("a b c", FileNameSanitizer.sanitize("a/b:c"))
        assertEquals("فيديو رائع", FileNameSanitizer.sanitize("  فيديو   رائع?  "))
        assertEquals("video", FileNameSanitizer.sanitize("..."))
        assertEquals("video", FileNameSanitizer.sanitize(null))
        assertEquals(FileNameSanitizer.MAX_LENGTH, FileNameSanitizer.sanitize("x".repeat(500)).length)
    }

    @Test fun `formats bytes and durations`() {
        assertEquals("0 B", Formatters.bytes(0))
        assertEquals("512 B", Formatters.bytes(512))
        assertEquals("1.5 KB", Formatters.bytes(1536))
        assertEquals("10.0 MB", Formatters.bytes(10L * 1024 * 1024))
        assertEquals("0:05", Formatters.duration(5))
        assertEquals("3:07", Formatters.duration(187))
        assertEquals("1:01:01", Formatters.duration(3661))
    }

    @Test fun `parses yt-dlp progress totals`() {
        assertEquals((12.5 * 1024 * 1024).toLong(), ProgressParser.totalBytes("[download]  42.0% of ~ 12.50MiB at 1.10MiB/s ETA 00:09"))
        assertEquals(2_000_000L, ProgressParser.totalBytes("[download]  10% of 2.00MB at 1MB/s"))
        assertEquals(0L, ProgressParser.totalBytes("[Merger] Merging formats"))
    }

    @Test fun `buckets dates relative to today`() {
        val tz = TimeZone.getTimeZone("UTC")
        val now = Calendar.getInstance(tz).apply { set(2026, Calendar.NOVEMBER, 4, 15, 0, 0) }.timeInMillis
        val hour = 3_600_000L
        assertEquals(DateBucket.TODAY, DateBuckets.bucket(now - 2 * hour, now, tz))
        assertEquals(DateBucket.YESTERDAY, DateBuckets.bucket(now - 20 * hour, now, tz))
        assertEquals(DateBucket.THIS_WEEK, DateBuckets.bucket(now - 4 * 24 * hour, now, tz))
        assertEquals(DateBucket.THIS_MONTH, DateBuckets.bucket(now - 20 * 24 * hour, now, tz))
        assertEquals(DateBucket.OLDER, DateBuckets.bucket(now - 90 * 24 * hour, now, tz))
    }
}
