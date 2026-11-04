package com.noureddine.videodownloader.data

import com.noureddine.videodownloader.data.extractor.ErrorMapper
import com.noureddine.videodownloader.data.extractor.FormatMapper
import com.noureddine.videodownloader.data.extractor.RawFormat
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.PreferredQuality
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class FormatMapperTest {

    private val formats = listOf(
        RawFormat("140", "m4a", 0, "none", "mp4a.40.2", 3_000_000),
        RawFormat("251", "webm", 0, "none", "opus", 3_500_000),
        RawFormat("137", "mp4", 1080, "avc1", "none", 50_000_000),
        RawFormat("248", "webm", 1080, "vp9", "none", 40_000_000),
        RawFormat("136", "mp4", 720, "avc1", "none", 25_000_000),
        RawFormat("18", "mp4", 360, "avc1", "mp4a", 8_000_000),
    )

    @Test fun `one option per resolution, sorted, plus audio`() {
        val options = FormatMapper.map(formats, durationSeconds = 120)
        assertEquals(listOf("1080p", "720p", "360p", "Audio"), options.map { it.label })
        assertTrue(options.last().isAudioOnly)
        assertEquals("m4a", options.last().extension)
    }

    @Test fun `video-only streams add best audio size, muxed streams do not`() {
        val options = FormatMapper.map(formats, 120)
        assertEquals(50_000_000L + 3_500_000L, options.first { it.height == 1080 }.estimatedSize)
        assertEquals(8_000_000L, options.first { it.height == 360 }.estimatedSize)
    }

    @Test fun `selectors cap height and fall back`() {
        val sel = FormatMapper.map(formats, 120).first { it.height == 720 }.formatSelector
        assertTrue(sel.startsWith("bv*[height<=720]+ba"))
        assertTrue(sel.endsWith("/b"))
    }

    @Test fun `estimates size from bitrate when missing`() {
        val opts = FormatMapper.map(listOf(RawFormat("x", "mp4", 480, "avc1", "aac", 0, tbrKbps = 800)), 100)
        assertEquals(800L * 1000 / 8 * 100, opts.first().estimatedSize)
    }

    @Test fun `falls back to best when no heights are known`() {
        val opts = FormatMapper.map(listOf(RawFormat("0", "mp4", 0, null, null, 0)), 0)
        assertEquals(FormatMapper.BEST_ID, opts.single().id)
    }

    @Test fun `default selection honours preference`() {
        val options = FormatMapper.map(formats, 120)
        assertEquals(1080, FormatMapper.pickDefault(options, PreferredQuality.BEST)!!.height)
        assertEquals(720, FormatMapper.pickDefault(options, PreferredQuality.HD)!!.height)
        assertEquals(360, FormatMapper.pickDefault(options, PreferredQuality.SD)!!.height)
        assertTrue(FormatMapper.pickDefault(options, PreferredQuality.AUDIO)!!.isAudioOnly)
    }

    @Test fun `maps engine errors to typed errors`() {
        assertEquals(AppError.UnsupportedUrl, ErrorMapper.map(Exception("ERROR: Unsupported URL: https://a.b")))
        assertEquals(AppError.LoginRequired, ErrorMapper.map(Exception("ERROR: [Instagram] abc: login required")))
        assertEquals(AppError.DrmProtected, ErrorMapper.map(Exception("ERROR: This video is DRM protected")))
        assertEquals(AppError.NotFound, ErrorMapper.map(Exception("ERROR: HTTP Error 404: Not Found")))
        assertEquals(AppError.Network, ErrorMapper.map(IOException("reset")))
        assertTrue(ErrorMapper.map(Exception("weird")) is AppError.Unknown)
        assertEquals(AppError.NotFound, ErrorMapper.map(AppError.NotFound))
    }
}
