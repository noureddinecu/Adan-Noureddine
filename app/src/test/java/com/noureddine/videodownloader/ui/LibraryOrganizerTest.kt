package com.noureddine.videodownloader.ui

import com.noureddine.videodownloader.core.util.DateBucket
import com.noureddine.videodownloader.domain.model.DownloadEngine
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.DownloadStatus
import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.ui.library.LibraryOrganizer
import com.noureddine.videodownloader.ui.library.LibrarySort
import org.junit.Assert.assertEquals
import org.junit.Test

class LibraryOrganizerTest {
    private val now = System.currentTimeMillis()
    private val day = 86_400_000L

    private fun item(id: Long, platform: Platform, ageDays: Long, status: DownloadStatus = DownloadStatus.COMPLETED, size: Long = id, name: String = "v$id") =
        DownloadItem(
            id = id, sourceUrl = "u", title = name, uploader = null, thumbnailUrl = null, durationSeconds = 0,
            platform = platform, qualityLabel = "720p", isAudioOnly = false, status = status, progress = 1f,
            downloadedBytes = 0, totalBytes = 0, etaSeconds = 0, errorMessage = null, fileUri = "file:///x",
            fileName = "$name.mp4", mimeType = "video/mp4", fileSize = size, createdAt = now - ageDays * day,
            completedAt = now - ageDays * day, engine = DownloadEngine.YTDLP,
        )

    private val items = listOf(
        item(1, Platform.TIKTOK, 0),
        item(2, Platform.FACEBOOK, 3),
        item(3, Platform.TIKTOK, 60, size = 999),
        item(4, Platform.X, 0, status = DownloadStatus.FAILED),
    )

    @Test fun `only completed items, grouped by date`() {
        val s = LibraryOrganizer.organize(items, null, LibrarySort.NEWEST, now)
        assertEquals(3, s.totalCount)
        assertEquals(listOf(DateBucket.TODAY, DateBucket.THIS_WEEK, DateBucket.OLDER), s.sections.map { it.first })
        assertEquals(listOf(Platform.FACEBOOK, Platform.TIKTOK), s.platforms)
    }

    @Test fun `filters by platform`() {
        val s = LibraryOrganizer.organize(items, Platform.TIKTOK, LibrarySort.NEWEST, now)
        assertEquals(listOf(1L, 3L), s.sections.flatMap { it.second }.map { it.id })
    }

    @Test fun `sorts by size without date grouping`() {
        val s = LibraryOrganizer.organize(items, null, LibrarySort.SIZE, now)
        assertEquals(1, s.sections.size)
        assertEquals(listOf(3L, 2L, 1L), s.sections.single().second.map { it.id })
    }
}
