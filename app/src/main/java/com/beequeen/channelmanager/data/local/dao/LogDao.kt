package com.beequeen.channelmanager.data.local.dao

import androidx.room.*
import com.beequeen.channelmanager.data.local.entities.LogEntry
import kotlinx.coroutines.flow.Flow

@Dao
interface LogDao {
    @Insert
    suspend fun insertLog(log: LogEntry)

    @Query("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 500")
    fun getLogs(): Flow<List<LogEntry>>

    @Query("DELETE FROM logs")
    suspend fun clearLogs()
}
