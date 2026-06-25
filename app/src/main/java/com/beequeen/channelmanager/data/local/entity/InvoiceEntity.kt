package com.beequeen.channelmanager.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.Date

@Entity(tableName = "invoices")
data class InvoiceEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val invoiceNumber: String,
    val customerId: Long,
    val date: Long, // epoch millis
    val totalAmount: Double,
    val discountAmount: Double = 0.0,
    val commissionAmount: Double = 0.0,
    val paymentStatus: String // PAID, PARTIAL, CREDIT
)
