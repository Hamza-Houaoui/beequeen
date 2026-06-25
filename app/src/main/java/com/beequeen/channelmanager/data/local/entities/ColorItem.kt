package com.beequeen.channelmanager.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ForeignKey

@Entity(
    tableName = "colors",
    foreignKeys = [
        ForeignKey(
            entity = ProductModel::class,
            parentColumns = ["id"],
            childColumns = ["modelId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class ColorItem(
    @PrimaryKey val id: String, // Random UUID
    val modelId: String,
    val colorName: String,
    val photoUri: String,
    val videoUri: String,
    val wholesaleMessageIds: String, // Comma separated IDs of messages in wholesale channel
    val retailMessageIds: String // Comma separated IDs of messages in retail channel
)
