package com.noureddine.videodownloader.core.util

object FileNameSanitizer {
    private val illegal = Regex("""[\\/:*?"<>|\u0000-\u001F]""")
    private val spaces = Regex("""\s+""")
    const val MAX_LENGTH = 100

    /** Produces a safe file base-name (no extension) that keeps Unicode such as Arabic. */
    fun sanitize(name: String?, fallback: String = "video"): String {
        val cleaned = (name ?: "")
            .replace(illegal, " ")
            .replace(spaces, " ")
            .trim()
            .trim('.')
            .take(MAX_LENGTH)
            .trim()
        return cleaned.ifEmpty { fallback }
    }
}
