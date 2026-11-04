package com.noureddine.videodownloader.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Carries links shared into the app (ACTION_SEND / ACTION_VIEW) to the Home screen. */
@Singleton
class SharedLinkBus @Inject constructor() {
    private val _link = MutableStateFlow<String?>(null)
    val link: StateFlow<String?> = _link.asStateFlow()
    fun publish(url: String) { _link.value = url }
    fun consume() { _link.value = null }
}
