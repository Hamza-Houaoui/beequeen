package com.beequeen.channelmanager.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "products")
data class ProductModel(
    @PrimaryKey val id: String, // Random UUID
    val code: String,
    val size: String,
    val price: String,
    val timestamp: Long
)
