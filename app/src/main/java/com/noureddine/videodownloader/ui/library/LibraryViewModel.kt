package com.noureddine.videodownloader.ui.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.noureddine.videodownloader.core.util.DateBucket
import com.noureddine.videodownloader.core.util.DateBuckets
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.DownloadStatus
import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.domain.repository.DownloadRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class LibrarySort { NEWEST, OLDEST, NAME, SIZE }

data class LibraryUiState(
    val sections: List<Pair<DateBucket, List<DownloadItem>>> = emptyList(),
    val platforms: List<Platform> = emptyList(),
    val filter: Platform? = null,
    val sort: LibrarySort = LibrarySort.NEWEST,
    val totalCount: Int = 0,
    val loaded: Boolean = false,
)

sealed interface LibraryEvent {
    data object Renamed : LibraryEvent
    data object RenameFailed : LibraryEvent
    data object Deleted : LibraryEvent
    data object DeleteFailed : LibraryEvent
}

/** Pure organising logic, unit-tested independently of Android. */
object LibraryOrganizer {
    fun organize(
        all: List<DownloadItem>,
        filter: Platform?,
        sort: LibrarySort,
        now: Long,
    ): LibraryUiState {
        val done = all.filter { it.status == DownloadStatus.COMPLETED }
        val platforms = done.map { it.platform }.distinct().sortedBy { it.ordinal }
        val filtered = done.filter { filter == null || it.platform == filter }
        val sorted = when (sort) {
            LibrarySort.NEWEST -> filtered.sortedByDescending { it.completedAt ?: it.createdAt }
            LibrarySort.OLDEST -> filtered.sortedBy { it.completedAt ?: it.createdAt }
            LibrarySort.NAME -> filtered.sortedBy { (it.fileName ?: it.title).lowercase() }
            LibrarySort.SIZE -> filtered.sortedByDescending { it.fileSize }
        }
        val sections = if (sort == LibrarySort.NEWEST || sort == LibrarySort.OLDEST) {
            sorted.groupBy { DateBuckets.bucket(it.completedAt ?: it.createdAt, now) }.toList()
        } else listOf(DateBucket.OLDER to sorted).filter { it.second.isNotEmpty() }
        return LibraryUiState(sections, platforms, filter, sort, done.size, loaded = true)
    }
}

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val downloads: DownloadRepository,
) : ViewModel() {

    private val filter = MutableStateFlow<Platform?>(null)
    private val sort = MutableStateFlow(LibrarySort.NEWEST)

    private val _events = Channel<LibraryEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    val state: StateFlow<LibraryUiState> = combine(downloads.observeAll(), filter, sort) { all, f, s ->
        LibraryOrganizer.organize(all, f, s, System.currentTimeMillis())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LibraryUiState())

    fun setFilter(platform: Platform?) { filter.value = platform }
    fun setSort(value: LibrarySort) { sort.value = value }

    fun rename(id: Long, name: String) = viewModelScope.launch {
        _events.send(if (downloads.rename(id, name)) LibraryEvent.Renamed else LibraryEvent.RenameFailed)
    }

    fun delete(id: Long) = viewModelScope.launch {
        _events.send(if (downloads.delete(id, deleteFile = true)) LibraryEvent.Deleted else LibraryEvent.DeleteFailed)
    }
}
