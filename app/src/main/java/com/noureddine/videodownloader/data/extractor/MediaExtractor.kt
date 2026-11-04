package com.noureddine.videodownloader.data.extractor

import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.model.Platform

interface MediaExtractor {
    fun canHandle(url: String, platform: Platform): Boolean
    suspend fun extract(url: String, platform: Platform): MediaInfo
}
