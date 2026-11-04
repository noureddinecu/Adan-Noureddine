package com.noureddine.videodownloader.core.util

import java.util.Calendar
import java.util.TimeZone

enum class DateBucket { TODAY, YESTERDAY, THIS_WEEK, THIS_MONTH, OLDER }

object DateBuckets {
    fun bucket(timestamp: Long, now: Long, zone: TimeZone = TimeZone.getDefault()): DateBucket {
        val startToday = startOfDay(now, zone)
        val day = 24L * 60 * 60 * 1000
        return when {
            timestamp >= startToday -> DateBucket.TODAY
            timestamp >= startToday - day -> DateBucket.YESTERDAY
            timestamp >= startToday - 6 * day -> DateBucket.THIS_WEEK
            timestamp >= startToday - 29 * day -> DateBucket.THIS_MONTH
            else -> DateBucket.OLDER
        }
    }

    private fun startOfDay(t: Long, zone: TimeZone): Long = Calendar.getInstance(zone).apply {
        timeInMillis = t
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}
