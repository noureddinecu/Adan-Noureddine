package com.noureddine.videodownloader.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.repository.DownloadRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HistoryUiState(val items: List<DownloadItem> = emptyList(), val query: String = "", val loaded: Boolean = false)

@HiltViewModel
class HistoryViewModel @Inject constructor(
    private val downloads: DownloadRepository,
) : ViewModel() {
    private val query = MutableStateFlow("")

    val state: StateFlow<HistoryUiState> = combine(downloads.observeAll(), query) { all, q ->
        val filtered = if (q.isBlank()) all else all.filter {
            it.title.contains(q, ignoreCase = true) || it.sourceUrl.contains(q, ignoreCase = true) ||
                it.platform.displayName.contains(q, ignoreCase = true)
        }
        HistoryUiState(filtered, q, loaded = true)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HistoryUiState())

    fun setQuery(q: String) { query.value = q }
    fun retry(id: Long) = viewModelScope.launch { downloads.retry(id) }
    fun removeRecord(id: Long) = viewModelScope.launch { downloads.delete(id, deleteFile = false) }
    fun clearInactive() = viewModelScope.launch { downloads.clearInactiveHistory() }
}
