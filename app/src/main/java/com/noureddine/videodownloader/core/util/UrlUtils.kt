package com.noureddine.videodownloader.core.util

import java.net.URI

object UrlUtils {
    private val urlRegex = Regex("""(https?://|www\.)[^\s<>"']+""", RegexOption.IGNORE_CASE)

    /** Extracts the first http(s) link from arbitrary shared text (e.g. "Watch this! https://…"). */
    fun extractFirstUrl(text: String?): String? {
        if (text.isNullOrBlank()) return null
        val match = urlRegex.find(text)?.value ?: return null
        return normalize(match.trimEnd('.', ',', ')', ']', '!', '?', ';'))
    }

    fun normalize(raw: String): String {
        val t = raw.trim()
        return if (t.startsWith("http://", true) || t.startsWith("https://", true)) t else "https://$t"
    }

    fun isValidHttpUrl(url: String): Boolean {
        val uri = runCatching { URI(url.trim()) }.getOrNull() ?: return false
        val scheme = uri.scheme?.lowercase()
        val host = uri.host
        return (scheme == "http" || scheme == "https") && !host.isNullOrBlank() && host.contains('.')
    }
}
