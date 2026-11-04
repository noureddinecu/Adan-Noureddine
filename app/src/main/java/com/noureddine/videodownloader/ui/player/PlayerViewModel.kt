package com.noureddine.videodownloader.ui.player

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.repository.DownloadRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class PlayerViewModel @Inject constructor(
    savedState: SavedStateHandle,
    downloads: DownloadRepository,
) : ViewModel() {
    private val id: Long = savedState.get<Long>("id") ?: -1L
    val item: StateFlow<DownloadItem?> = downloads.observe(id)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}
