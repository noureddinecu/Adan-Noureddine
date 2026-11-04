package com.noureddine.videodownloader.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [DownloadEntity::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun downloadDao(): DownloadDao
}
