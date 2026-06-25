package com.beequeen.channelmanager.data.local.dao

import androidx.room.*
import com.beequeen.channelmanager.data.local.entities.ProductModel
import com.beequeen.channelmanager.data.local.entities.ColorItem
import kotlinx.coroutines.flow.Flow

data class ProductWithColors(
    @Embedded val product: ProductModel,
    @Relation(
        parentColumn = "id",
        entityColumn = "modelId"
    )
    val colors: List<ColorItem>
)

@Dao
interface ProductDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProduct(product: ProductModel)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertColor(color: ColorItem)

    @Transaction
    @Query("SELECT * FROM products ORDER BY timestamp DESC")
    fun getAllProducts(): Flow<List<ProductWithColors>>

    @Transaction
    @Query("SELECT * FROM products WHERE id = :id")
    suspend fun getProductWithColors(id: String): ProductWithColors?

    @Query("DELETE FROM products WHERE id = :id")
    suspend fun deleteProduct(id: String)

    @Query("DELETE FROM colors WHERE id = :colorId")
    suspend fun deleteColor(colorId: String)
}
