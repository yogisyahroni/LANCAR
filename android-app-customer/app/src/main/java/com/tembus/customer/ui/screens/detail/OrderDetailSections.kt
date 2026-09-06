package com.tembus.customer.ui.screens.detail

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.data.model.FoodOrderItem
import com.tembus.customer.data.model.Order
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.TembusRadius

@Composable
fun OrderServiceSpecificSections(order: Order) {
    when (orderDetailSectionKind(order.foodItems.isNotEmpty(), order.serviceSubType, order.serviceCategory)) {
        OrderDetailSectionKind.FOOD -> FoodOrderSection(order.foodItems, order.orderNotes)
        OrderDetailSectionKind.ROADSIDE ->
            RoadsideOrderSection(order.orderId, order.serviceSubType.orEmpty())
        OrderDetailSectionKind.PACKAGE -> PackageOrderSection(order.serviceSubType)
        OrderDetailSectionKind.UNKNOWN -> UnknownOrderSection()
    }
}

internal enum class OrderDetailSectionKind { FOOD, ROADSIDE, PACKAGE, UNKNOWN }

internal fun orderDetailSectionKind(
    hasFoodItems: Boolean,
    serviceSubType: String?,
    serviceCategory: String? = null
): OrderDetailSectionKind {
    if (hasFoodItems) return OrderDetailSectionKind.FOOD
    val subtype = serviceSubType.orEmpty().trim().lowercase()
    val category = serviceCategory.orEmpty().trim().lowercase()

    return when {
        category == "food" || category == "food_delivery" || subtype == "food" || subtype == "food_delivery" ->
            OrderDetailSectionKind.FOOD
        category == "tambal_ban" || category == "towing" ||
            subtype.startsWith("tambal_ban") || subtype.startsWith("towing") ->
            OrderDetailSectionKind.ROADSIDE
        category == "package_on_demand" || category == "regular" || category == "on_demand" ||
            subtype in setOf("tembus_instant", "p2p", "regular", "package_on_demand", "on_demand") ->
            OrderDetailSectionKind.PACKAGE
        else -> OrderDetailSectionKind.UNKNOWN
    }
}

@Composable
private fun FoodOrderSection(items: List<FoodOrderItem>, orderNotes: String?) {
    OrderSectionCard(title = "Rincian Pesanan") {
        items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("${item.quantity}×", fontWeight = FontWeight.Black, color = Accent)
                Column(modifier = Modifier.weight(1f)) {
                    Text(item.name, fontWeight = FontWeight.SemiBold, color = OnSurface)
                    if (item.variants.isNotEmpty()) {
                        Text(item.variants.joinToString(" · ") { variant -> "${variant.variantName}: ${variant.optionName}" }, fontSize = 12.sp, color = OnSurfaceVariant)
                    }
                    if (!item.notes.isNullOrBlank()) Text("Catatan: ${item.notes}", fontSize = 12.sp, color = OnSurfaceVariant)
                }
                if (item.subtotal > 0) Text("Rp ${item.subtotal}", fontWeight = FontWeight.Bold, color = Primary)
            }
            HorizontalDivider(color = Outline.copy(alpha = 0.4f))
        }
        if (!orderNotes.isNullOrBlank()) {
            Spacer(Modifier.height(10.dp))
            Text("Catatan untuk merchant:", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = OnSurfaceVariant)
            Text(orderNotes, fontSize = 14.sp, color = OnSurface, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
private fun RoadsideOrderSection(orderId: String, serviceSubType: String) {
    val label = serviceSubType.replace('_', ' ').replaceFirstChar { it.uppercase() }
    OrderSectionCard(title = "Detail Layanan") {
        Text(label, fontWeight = FontWeight.Bold, color = OnSurface)
        Text("Layanan bantuan kendaraan. Status, teknisi, dan bukti layanan mengikuti data server.", fontSize = 13.sp, color = OnSurfaceVariant)
    }
    if (orderId.isNotBlank()) {
        RoadsideAdjustmentSection(orderId = orderId)
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun PackageOrderSection(serviceSubType: String?) {
    OrderSectionCard(title = "Detail Layanan") {
        Text(serviceSubType?.takeIf { it.isNotBlank() } ?: "Layanan belum teridentifikasi", fontWeight = FontWeight.Bold, color = OnSurface)
        Text("Detail layanan akan ditampilkan setelah server mengirimkan metadata order.", fontSize = 13.sp, color = OnSurfaceVariant)
    }
}

@Composable
private fun UnknownOrderSection() {
    OrderSectionCard(title = "Detail Layanan") {
        Text("Layanan belum teridentifikasi", fontWeight = FontWeight.Bold, color = OnSurface)
        Text(
            "Detail layanan belum dikirim server. Hubungi bantuan jika status order perlu diperiksa.",
            fontSize = 13.sp,
            color = OnSurfaceVariant
        )
    }
}

@Composable
private fun OrderSectionCard(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Outline)
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = OnSurface)
            content()
        }
    }
    Spacer(Modifier.height(16.dp))
}
