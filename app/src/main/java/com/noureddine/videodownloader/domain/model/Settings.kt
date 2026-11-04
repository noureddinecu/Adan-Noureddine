package com.noureddine.videodownloader.domain.model

enum class ThemeMode { SYSTEM, LIGHT, DARK }

enum class StorageLocation { DOWNLOADS, APP_FOLDER }

/** User's preferred default quality; the closest available option is pre-selected. */
enum class PreferredQuality(val maxHeight: Int) {
    BEST(Int.MAX_VALUE), FHD(1080), HD(720), SD(480), AUDIO(0)
}

data class AppSettings(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val dynamicColor: Boolean = false,
    val storageLocation: StorageLocation = StorageLocation.DOWNLOADS,
    val preferredQuality: PreferredQuality = PreferredQuality.BEST,
    val wifiOnly: Boolean = false,
)
