package com.beequeen.channelmanager.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val modelName: String,
    val colour: String,
    val size: String,
    val wholesalePrice: Double,
    val retailPrice: Double,
    val stockQuantity: Int
)
