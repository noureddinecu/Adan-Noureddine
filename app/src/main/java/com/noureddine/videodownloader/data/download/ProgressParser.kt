package com.noureddine.videodownloader.data.download

/** Parses yt-dlp's "[download]  42.0% of ~ 12.30MiB at 1.10MiB/s ETA 00:09" lines. */
object ProgressParser {
    private val sizeRegex = Regex("""of\s+~?\s*([\d.]+)\s*([KMGT]?i?B)""", RegexOption.IGNORE_CASE)

    fun totalBytes(line: String?): Long {
        val m = sizeRegex.find(line ?: return 0) ?: return 0
        val value = m.groupValues[1].toDoubleOrNull() ?: return 0
        return (value * multiplier(m.groupValues[2])).toLong()
    }

    private fun multiplier(unit: String): Double = when (unit.uppercase()) {
        "KIB" -> 1024.0
        "MIB" -> 1024.0 * 1024
        "GIB" -> 1024.0 * 1024 * 1024
        "TIB" -> 1024.0 * 1024 * 1024 * 1024
        "KB" -> 1e3
        "MB" -> 1e6
        "GB" -> 1e9
        "TB" -> 1e12
        else -> 1.0
    }
}
