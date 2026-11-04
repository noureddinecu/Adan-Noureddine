package com.noureddine.videodownloader.ui

import com.noureddine.videodownloader.core.SharedLinkBus
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.AppSettings
import com.noureddine.videodownloader.domain.model.DownloadEngine
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.domain.model.PreferredQuality
import com.noureddine.videodownloader.domain.model.QualityOption
import com.noureddine.videodownloader.domain.model.StorageLocation
import com.noureddine.videodownloader.domain.model.ThemeMode
import com.noureddine.videodownloader.domain.repository.DownloadRepository
import com.noureddine.videodownloader.domain.repository.MediaRepository
import com.noureddine.videodownloader.domain.repository.SettingsRepository
import com.noureddine.videodownloader.ui.home.HomeEvent
import com.noureddine.videodownloader.ui.home.HomeViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private val q1080 = QualityOption("h1080", "1080p", 1080, false, "sel1080", "mp4", 100)
    private val q720 = QualityOption("h720", "720p", 720, false, "sel720", "mp4", 50)
    private val audio = QualityOption("audio", "Audio", 0, true, "ba", "m4a", 5)

    private fun info(allowed: Boolean = true, platform: Platform = Platform.TIKTOK) = MediaInfo(
        sourceUrl = "https://www.tiktok.com/@a/video/1", webpageUrl = "https://www.tiktok.com/@a/video/1",
        title = "Clip", uploader = "a", thumbnailUrl = null, durationSeconds = 10, platform = platform,
        engine = DownloadEngine.YTDLP, qualities = listOf(q1080, q720, audio), downloadAllowed = allowed,
    )

    private class FakeMedia(var result: () -> MediaInfo) : MediaRepository {
        var calls = 0
        override suspend fun analyze(url: String): MediaInfo { calls++; return result() }
    }

    private class FakeDownloads : DownloadRepository {
        val enqueued = mutableListOf<Pair<MediaInfo, QualityOption>>()
        override fun observeAll(): Flow<List<DownloadItem>> = flowOf(emptyList())
        override fun observe(id: Long): Flow<DownloadItem?> = flowOf(null)
        override suspend fun get(id: Long): DownloadItem? = null
        override suspend fun enqueue(info: MediaInfo, quality: QualityOption): Long {
            if (!info.downloadAllowed) throw AppError.PolicyBlocked
            enqueued += info to quality; return enqueued.size.toLong()
        }
        override suspend fun pause(id: Long) {}
        override suspend fun resume(id: Long) {}
        override suspend fun cancel(id: Long) {}
        override suspend fun delete(id: Long, deleteFile: Boolean) = true
        override suspend fun rename(id: Long, newBaseName: String) = true
        override suspend fun clearInactiveHistory() {}
    }

    private class FakeSettings(q: PreferredQuality) : SettingsRepository {
        override val settings = MutableStateFlow(AppSettings(preferredQuality = q))
        override suspend fun setThemeMode(mode: ThemeMode) {}
        override suspend fun setDynamicColor(enabled: Boolean) {}
        override suspend fun setStorageLocation(location: StorageLocation) {}
        override suspend fun setPreferredQuality(quality: PreferredQuality) {}
        override suspend fun setWifiOnly(enabled: Boolean) {}
    }

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun `empty url yields invalid url error without network call`() = runTest(dispatcher) {
        val media = FakeMedia { info() }
        val vm = HomeViewModel(media, FakeDownloads(), FakeSettings(PreferredQuality.BEST), SharedLinkBus())
        vm.analyze()
        advanceUntilIdle()
        assertEquals(AppError.InvalidUrl, vm.state.value.error)
        assertEquals(0, media.calls)
    }

    @Test fun `analyze populates media and preselects preferred quality`() = runTest(dispatcher) {
        val vm = HomeViewModel(FakeMedia { info() }, FakeDownloads(), FakeSettings(PreferredQuality.HD), SharedLinkBus())
        vm.onUrlChange("https://www.tiktok.com/@a/video/1")
        vm.analyze()
        advanceUntilIdle()
        val s = vm.state.value
        assertFalse(s.analyzing)
        assertEquals("Clip", s.media?.title)
        assertEquals("h720", s.selectedQualityId)
        assertTrue(s.canDownload)
    }

    @Test fun `analysis errors are surfaced as typed errors`() = runTest(dispatcher) {
        val vm = HomeViewModel(FakeMedia { throw AppError.LoginRequired }, FakeDownloads(), FakeSettings(PreferredQuality.BEST), SharedLinkBus())
        vm.onUrlChange("https://instagram.com/p/x")
        vm.analyze()
        advanceUntilIdle()
        assertEquals(AppError.LoginRequired, vm.state.value.error)
        assertNull(vm.state.value.media)
    }

    @Test fun `download enqueues selected quality and resets form`() = runTest(dispatcher) {
        val downloads = FakeDownloads()
        val vm = HomeViewModel(FakeMedia { info() }, downloads, FakeSettings(PreferredQuality.BEST), SharedLinkBus())
        vm.onUrlChange("https://www.tiktok.com/@a/video/1")
        vm.analyze(); advanceUntilIdle()
        vm.selectQuality("audio")
        vm.download(); advanceUntilIdle()
        assertEquals(audio, downloads.enqueued.single().second)
        assertNull(vm.state.value.media)
        assertTrue(vm.events.first() is HomeEvent.DownloadQueued)
    }

    @Test fun `policy blocked media cannot be downloaded`() = runTest(dispatcher) {
        val downloads = FakeDownloads()
        val vm = HomeViewModel(FakeMedia { info(allowed = false, platform = Platform.YOUTUBE) }, downloads, FakeSettings(PreferredQuality.BEST), SharedLinkBus())
        vm.onUrlChange("https://youtu.be/x")
        vm.analyze(); advanceUntilIdle()
        assertFalse(vm.state.value.canDownload)
        vm.download(); advanceUntilIdle()
        assertTrue(downloads.enqueued.isEmpty())
        assertEquals(AppError.PolicyBlocked, vm.state.value.error)
    }

    @Test fun `shared links are analyzed automatically`() = runTest(dispatcher) {
        val bus = SharedLinkBus()
        val media = FakeMedia { info() }
        val vm = HomeViewModel(media, FakeDownloads(), FakeSettings(PreferredQuality.BEST), bus)
        bus.publish("https://www.tiktok.com/@a/video/1")
        advanceUntilIdle()
        assertEquals(1, media.calls)
        assertEquals("https://www.tiktok.com/@a/video/1", vm.state.value.url)
        assertNull(bus.link.value)
    }
}
