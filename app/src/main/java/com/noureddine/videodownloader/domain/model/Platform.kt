package com.noureddine.videodownloader.domain.model

/** Video sources recognised by the app. [OTHER] is attempted through the generic engine. */
enum class Platform(val displayName: String) {
    FACEBOOK("Facebook"),
    TIKTOK("TikTok"),
    INSTAGRAM("Instagram"),
    YOUTUBE("YouTube"),
    X("X"),
    VIMEO("Vimeo"),
    DIRECT("Direct link"),
    OTHER("Web");

    companion object {
        fun fromName(name: String?): Platform = entries.firstOrNull { it.name == name } ?: OTHER
    }
}
