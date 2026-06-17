package com.tembus.customer.ui.screens.business

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.Background

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BusinessScreen(
    viewModel: BusinessViewModel = hiltViewModel(),
    onBackClick: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    
    var title by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var destination by remember { mutableStateOf("") }

    Scaffold(
        containerColor = Background,
        topBar = {
            TopAppBar(
                title = { Text("Generate Payment Link", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Primary,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Background)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    "Buat Link Pembayaran untuk Pelanggan",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Color(0xFF17202A)
                )
                Text(
                    "Buat tagihan khusus pesanan WhatsApp. Link kedaluwarsa dalam 10 menit dan valid selama 1x24 jam.",
                    fontSize = 14.sp,
                    color = Color(0xFF6B7280)
                )

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Nama Barang / Order") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary,
                        focusedLabelColor = Primary
                    )
                )

                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it },
                    label = { Text("Total Harga (Rp)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary,
                        focusedLabelColor = Primary
                    )
                )

                OutlinedTextField(
                    value = destination,
                    onValueChange = { destination = it },
                    label = { Text("Alamat Tujuan (Kecamatan / Kota)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Primary,
                        focusedLabelColor = Primary
                    )
                )

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = {
                        val amountLong = amount.toLongOrNull() ?: 0L
                        if (title.isNotBlank() && amountLong > 0 && destination.isNotBlank()) {
                            viewModel.generatePaymentLink(title, amountLong, destination)
                        } else {
                            Toast.makeText(context, "Mohon lengkapi semua data dengan benar", Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    enabled = state !is BusinessUiState.Loading,
                    colors = ButtonDefaults.buttonColors(containerColor = Primary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (state is BusinessUiState.Loading) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    } else {
                        Text("Generate Link", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }

                if (state is BusinessUiState.Error) {
                    val msg = (state as BusinessUiState.Error).message
                    Text(msg, color = Color.Red, fontSize = 14.sp)
                }

                if (state is BusinessUiState.Success) {
                    val url = (state as BusinessUiState.Success).generatedUrl
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Primary),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(Icons.Default.Link, contentDescription = null, tint = Primary, modifier = Modifier.size(32.dp))
                            Spacer(Modifier.height(8.dp))
                            Text("Link Pembayaran Berhasil Dibuat", fontWeight = FontWeight.Bold, color = Primary)
                            Spacer(Modifier.height(8.dp))
                            Text(url, fontSize = 14.sp, color = Color(0xFF17202A), textAlign = TextAlign.Center)
                            Spacer(Modifier.height(16.dp))
                            OutlinedButton(
                                onClick = {
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    val clip = ClipData.newPlainText("Payment Link", url)
                                    clipboard.setPrimaryClip(clip)
                                    Toast.makeText(context, "Link berhasil disalin!", Toast.LENGTH_SHORT).show()
                                },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, Primary)
                            ) {
                                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp), tint = Primary)
                                Spacer(Modifier.width(8.dp))
                                Text("Salin Link", color = Primary, fontWeight = FontWeight.Bold)
                            }
                            
                            Spacer(Modifier.height(8.dp))
                            TextButton(onClick = { 
                                title = ""
                                amount = ""
                                destination = ""
                                viewModel.resetState() 
                            }) {
                                Text("Buat Link Baru", color = Primary)
                            }
                        }
                    }
                }
            }
        }
    }
}
