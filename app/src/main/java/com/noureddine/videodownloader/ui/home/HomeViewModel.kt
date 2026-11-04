package com.noureddine.videodownloader.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.noureddine.videodownloader.core.SharedLinkBus
import com.noureddine.videodownloader.data.extractor.ErrorMapper
import com.noureddine.videodownloader.data.extractor.FormatMapper
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.DownloadStatus
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.repository.DownloadRepository
import com.noureddine.videodownloader.domain.repository.MediaRepository
import com.noureddine.videodownloader.domain.repository.SettingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val url: String = "",
    val analyzing: Boolean = false,
    val media: MediaInfo? = null,
    val selectedQualityId: String? = null,
    val error: AppError? = null,
    val enqueuing: Boolean = false,
) {
    val selectedQuality get() = media?.qualities?.firstOrNull { it.id == selectedQualityId }
    val canDownload get() = media?.downloadAllowed == true && selectedQuality != null && !enqueuing
}

sealed interface HomeEvent {
    data class DownloadQueued(val id: Long) : HomeEvent
    data class Failed(val error: AppError) : HomeEvent
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val media: MediaRepository,
    private val downloads: DownloadRepository,
    private val settings: SettingsRepository,
    private val linkBus: SharedLinkBus,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    private val _events = Channel<HomeEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    val activeDownloads: StateFlow<List<DownloadItem>> = downloads.observeAll()
        .map { all -> all.filter { it.status.isActive || it.status == DownloadStatus.PAUSED } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private var analyzeJob: Job? = null

    init {
        viewModelScope.launch {
            linkBus.link.filterNotNull().collect { shared ->
                linkBus.consume()
                onUrlChange(shared)
                analyze()
            }
        }
    }

    fun onUrlChange(value: String) {
        _state.update { it.copy(url = value, error = null) }
    }

    fun clear() {
        analyzeJob?.cancel()
        _state.value = HomeUiState()
    }

    fun selectQuality(id: String) = _state.update { it.copy(selectedQualityId = id) }

    fun dismissError() = _state.update { it.copy(error = null) }

    fun analyze() {
        val url = _state.value.url.trim()
        if (url.isEmpty()) {
            _state.update { it.copy(error = AppError.InvalidUrl) }
            return
        }
        analyzeJob?.cancel()
        analyzeJob = viewModelScope.launch {
            _state.update { it.copy(analyzing = true, error = null, media = null, selectedQualityId = null) }
            try {
                val info = media.analyze(url)
                val preferred = settings.settings.first().preferredQuality
                val default = FormatMapper.pickDefault(info.qualities, preferred)
                _state.update { it.copy(analyzing = false, media = info, selectedQualityId = default?.id) }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (t: Throwable) {
                _state.update { it.copy(analyzing = false, error = ErrorMapper.map(t)) }
            }
        }
    }

    fun download() {
        val s = _state.value
        val info = s.media ?: return
        val quality = s.selectedQuality ?: return
        if (!info.downloadAllowed) {
            _state.update { it.copy(error = AppError.PolicyBlocked) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(enqueuing = true) }
            try {
                val id = downloads.enqueue(info, quality)
                _state.value = HomeUiState()
                _events.send(HomeEvent.DownloadQueued(id))
            } catch (t: Throwable) {
                _state.update { it.copy(enqueuing = false) }
                _events.send(HomeEvent.Failed(ErrorMapper.map(t)))
            }
        }
    }

    fun pause(id: Long) = viewModelScope.launch { downloads.pause(id) }
    fun resume(id: Long) = viewModelScope.launch { downloads.resume(id) }
    fun cancel(id: Long) = viewModelScope.launch { downloads.cancel(id) }
}
