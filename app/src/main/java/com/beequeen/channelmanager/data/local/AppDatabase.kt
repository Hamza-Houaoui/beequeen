package com.beequeen.channelmanager.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.beequeen.channelmanager.data.local.dao.LogDao
import com.beequeen.channelmanager.data.local.dao.ProductDao
import com.beequeen.channelmanager.data.local.entities.ColorItem
import com.beequeen.channelmanager.data.local.entities.LogEntry
import com.beequeen.channelmanager.data.local.entities.ProductModel

@Database(
    entities = [ProductModel::class, ColorItem::class, LogEntry::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun productDao(): ProductDao
    abstract fun logDao(): LogDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "beequeen_database"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}
