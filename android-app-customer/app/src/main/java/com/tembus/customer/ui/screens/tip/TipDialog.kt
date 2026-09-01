package com.tembus.customer.ui.screens.tip

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import com.tembus.customer.ui.localization.CustomerText as Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.ui.theme.Primary

private val tipOptions = listOf(5000L, 10000L, 20000L, 50000L)

private fun formatRupiah(amount: Long): String {
    return "Rp%,d".format(amount).replace(',', '.')
}

/**
 * FB-077: Dialog tip — pilih nominal, 100% masuk ke kurir.
 */
@Composable
fun TipDialog(
    courierName: String,
    orderNumber: String,
    isSubmitting: Boolean,
    isSubmitted: Boolean,
    errorMessage: String?,
    onSubmit: (Long) -> Unit,
    onDismiss: () -> Unit,
    onDismissError: () -> Unit
) {
    if (isSubmitted) {
        AlertDialog(
            onDismissRequest = onDismiss,
            containerColor = Color.White,
            shape = RoundedCornerShape(24.dp),
            confirmButton = {
                Button(
                    onClick = onDismiss,
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Text("Selesai", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = Color(0xFF7BC043),
                        modifier = Modifier.size(56.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Tip Terkirim!",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Terima kasih sudah mengapresiasi kurir. 100% tip masuk ke ${courierName.ifBlank { "kurir" }}.",
                        fontSize = 13.sp,
                        color = Color.Gray,
                        textAlign = TextAlign.Center
                    )
                }
            }
        )
        return
    }

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        containerColor = Color.White,
        shape = RoundedCornerShape(24.dp),
        confirmButton = {},
        dismissButton = {},
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Kasih Tip ke Kurir",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = if (courierName.isNotBlank()) "Apresiasi ${courierName} atas layanan terbaik." else "Apresiasi kurir atas layanan terbaik.",
                    fontSize = 13.sp,
                    color = Color.Gray
                )
                if (orderNumber.isNotBlank()) {
                    Text(
                        text = "Order $orderNumber",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Pilihan nominal
                tipOptions.chunked(2).forEach { rowOptions ->
                    Row(modifier = Modifier.fillMaxWidth()) {
                        rowOptions.forEach { amount ->
                            TipAmountChip(
                                amount = amount,
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(end = if (rowOptions.indexOf(amount) == 0) 8.dp else 0.dp)
                            ) { onSubmit(amount) }
                        }
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                }

                Text(
                    text = "100% tip masuk ke kurir. Tip tidak bisa dibatalkan.",
                    fontSize = 11.sp,
                    color = Color.Gray,
                    modifier = Modifier.padding(top = 4.dp)
                )

                errorMessage?.let { msg ->
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = msg,
                        color = Color(0xFFB42318),
                        fontSize = 12.sp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFFFFF1F1))
                            .padding(10.dp)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    TextButton(onClick = onDismissError) { Text("Tutup", fontSize = 12.sp) }
                }

                if (isSubmitting) {
                    Spacer(modifier = Modifier.height(12.dp))
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)),
                        color = Primary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Mengirim tip...",
                        fontSize = 12.sp,
                        color = Color.Gray,
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    )
                } else {
                    Spacer(modifier = Modifier.height(12.dp))
                    TextButton(
                        onClick = onDismiss,
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    ) {
                        Text("Nanti Saja", color = Color.Gray, fontSize = 14.sp)
                    }
                }
            }
        }
    )
}

@Composable
private fun TipAmountChip(
    amount: Long,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Primary.copy(alpha = 0.12f),
            contentColor = Primary
        ),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
    ) {
        Text(
            text = formatRupiah(amount),
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp
        )
    }
}
