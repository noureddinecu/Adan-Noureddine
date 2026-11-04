package com.noureddine.videodownloader.core.util

import java.util.Locale

object Formatters {
    fun bytes(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB", "TB")
        var value = bytes.toDouble()
        var i = 0
        while (value >= 1024 && i < units.lastIndex) { value /= 1024; i++ }
        return if (i == 0) "$bytes B" else String.format(Locale.US, "%.1f %s", value, units[i])
    }

    fun duration(totalSeconds: Long): String {
        if (totalSeconds <= 0) return "0:00"
        val h = totalSeconds / 3600
        val m = (totalSeconds % 3600) / 60
        val s = totalSeconds % 60
        return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s)
        else String.format(Locale.US, "%d:%02d", m, s)
    }
}
