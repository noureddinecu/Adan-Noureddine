package com.noureddine.videodownloader.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.noureddine.videodownloader.domain.model.AppSettings
import com.noureddine.videodownloader.domain.model.PreferredQuality
import com.noureddine.videodownloader.domain.model.StorageLocation
import com.noureddine.videodownloader.domain.model.ThemeMode
import com.noureddine.videodownloader.domain.repository.EngineRepository
import com.noureddine.videodownloader.domain.repository.SettingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface EngineState {
    data object Idle : EngineState
    data object Updating : EngineState
    data object Updated : EngineState
    data object UpToDate : EngineState
    data object Failed : EngineState
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repo: SettingsRepository,
    private val engine: EngineRepository,
) : ViewModel() {

    val settings: StateFlow<AppSettings> =
        repo.settings.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings())

    private val _engineVersion = MutableStateFlow<String?>(null)
    val engineVersion = _engineVersion.asStateFlow()
    private val _engineState = MutableStateFlow<EngineState>(EngineState.Idle)
    val engineState = _engineState.asStateFlow()

    init { viewModelScope.launch { _engineVersion.value = engine.version() } }

    fun setTheme(mode: ThemeMode) = viewModelScope.launch { repo.setThemeMode(mode) }
    fun setDynamic(v: Boolean) = viewModelScope.launch { repo.setDynamicColor(v) }
    fun setStorage(v: StorageLocation) = viewModelScope.launch { repo.setStorageLocation(v) }
    fun setQuality(v: PreferredQuality) = viewModelScope.launch { repo.setPreferredQuality(v) }
    fun setWifiOnly(v: Boolean) = viewModelScope.launch { repo.setWifiOnly(v) }

    fun updateEngine() = viewModelScope.launch {
        _engineState.value = EngineState.Updating
        _engineState.value = try {
            if (engine.update()) EngineState.Updated else EngineState.UpToDate
        } catch (t: Throwable) {
            EngineState.Failed
        }
        _engineVersion.value = engine.version()
    }
}
