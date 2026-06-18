package com.tembus.customer.ui.screens.business

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject

data class PaymentLinkResponse(
    val id: String,
    val merchant_id: String,
    val title: String,
    val total_amount: Long,
    val drop_address: String,
    val customer_name: String,
    val customer_phone: String,
    val status: String,
    val expired_at: String,
    val created_at: String,
    val updated_at: String
)

sealed class BusinessUiState {
    object Idle : BusinessUiState()
    object Loading : BusinessUiState()
    data class Success(val generatedUrl: String) : BusinessUiState()
    data class Error(val message: String) : BusinessUiState()
}

data class PaymentLinkForm(
    val itemName: String = "",
    val itemPrice: Long = 0L,
    val pickupAddress: String = "",
    val dropoffAddress: String = "",
    val serviceCode: String = "",
    val imageUri: Uri? = null
)

@HiltViewModel
class BusinessViewModel @Inject constructor(
    private val api: TEMBUSApiService,
    private val sessionManager: AuthSessionManager,
    private val okHttpClient: OkHttpClient
) : ViewModel() {

    private val _uiState = MutableStateFlow<BusinessUiState>(BusinessUiState.Idle)
    val uiState: StateFlow<BusinessUiState> = _uiState.asStateFlow()

    private val _storeName = MutableStateFlow("")
    val storeName: StateFlow<String> = _storeName.asStateFlow()

    private val _services = MutableStateFlow<List<DeliveryServiceProduct>>(emptyList())
    val services: StateFlow<List<DeliveryServiceProduct>> = _services.asStateFlow()

    private val _formState = MutableStateFlow(PaymentLinkForm())
    val formState: StateFlow<PaymentLinkForm> = _formState.asStateFlow()

    init {
        fetchProfile()
        fetchServices()
    }

    private fun fetchProfile() {
        viewModelScope.launch {
            try {
                val response = api.getProfile()
                if (response.isSuccessful && response.body()?.success == true) {
                    val profile = response.body()?.data
                    _storeName.value = profile?.storeName ?: "Toko Anda"
                    _formState.value = _formState.value.copy(
                        pickupAddress = profile?.defaultPickupAddress ?: ""
                    )
                }
            } catch (e: Exception) {
                // Ignore profile fetch error for now
            }
        }
    }

    private fun fetchServices() {
        viewModelScope.launch {
            try {
                val response = api.getCustomerDeliveryServices()
                if (response.isSuccessful && response.body()?.success == true) {
                    val svcList = response.body()?.services ?: emptyList()
                    _services.value = svcList
                    if (svcList.isNotEmpty() && _formState.value.serviceCode.isEmpty()) {
                        _formState.value = _formState.value.copy(serviceCode = svcList[0].code)
                    }
                }
            } catch (e: Exception) {
                // Ignore service fetch error
            }
        }
    }

    fun updateForm(updater: (PaymentLinkForm) -> PaymentLinkForm) {
        _formState.value = updater(_formState.value)
    }

    fun generatePaymentLink(context: Context) {
        val form = _formState.value
        viewModelScope.launch {
            _uiState.value = BusinessUiState.Loading
            try {
                val userId = sessionManager.getUserIdSync()
                if (userId == null) {
                    _uiState.value = BusinessUiState.Error("Sesi berakhir, silakan login kembali.")
                    return@launch
                }

                if (form.itemName.isBlank()) throw Exception("Nama Barang tidak boleh kosong")
                if (form.pickupAddress.isBlank()) throw Exception("Alamat Pickup tidak boleh kosong")
                if (form.dropoffAddress.isBlank()) throw Exception("Alamat Pengiriman tidak boleh kosong")
                if (form.serviceCode.isBlank()) throw Exception("Pilih Layanan pengiriman")
                if (form.imageUri == null) throw Exception("Foto barang tidak boleh kosong")

                // 1. Geocode Pickup
                val pickupRes = api.geocodeAddress(form.pickupAddress)
                val pickupLoc = pickupRes.body()?.results?.firstOrNull()
                    ?: throw Exception("Alamat Pickup tidak spesifik. Tambahkan patokan/kota.")
                
                // 2. Geocode Dropoff
                val dropoffRes = api.geocodeAddress(form.dropoffAddress)
                val dropoffLoc = dropoffRes.body()?.results?.firstOrNull()
                    ?: throw Exception("Alamat Pengiriman tidak spesifik. Tambahkan patokan/kota.")

                // 3. Upload Image via Presign
                val fileName = "payment_link_${System.currentTimeMillis()}.jpg"
                val presignRes = api.getPresignUrl(fileName, "image/jpeg")
                if (!presignRes.isSuccessful || presignRes.body() == null) {
                    throw Exception("Gagal mendapatkan URL upload")
                }
                
                val uploadUrl = presignRes.body()!!.url
                
                // Copy URI to temp file
                val tempFile = File(context.cacheDir, fileName)
                withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(form.imageUri)?.use { input ->
                        FileOutputStream(tempFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                }

                // PUT to presign URL
                val requestFile = tempFile.asRequestBody("image/jpeg".toMediaTypeOrNull())
                val uploadRequest = Request.Builder()
                    .url(uploadUrl)
                    .put(requestFile)
                    .build()

                withContext(Dispatchers.IO) {
                    val uploadResponse = okHttpClient.newCall(uploadRequest).execute()
                    if (!uploadResponse.isSuccessful) {
                        throw Exception("Gagal mengunggah foto barang")
                    }
                }
                
                val finalImageUrl = uploadUrl.substringBefore("?")

                // 4. Create Payment Link
                val requestBody = mapOf(
                    "item_name" to form.itemName,
                    "item_price" to form.itemPrice,
                    "item_image_url" to finalImageUrl,
                    "service_code" to form.serviceCode,
                    "pickup_address" to form.pickupAddress,
                    "pickup_lat" to pickupLoc.latitude,
                    "pickup_lng" to pickupLoc.longitude,
                    "dropoff_address" to form.dropoffAddress,
                    "dropoff_lat" to dropoffLoc.latitude,
                    "dropoff_lng" to dropoffLoc.longitude,
                    "store_name" to _storeName.value
                )
                
                val response = api.createPaymentLink(userId, requestBody)
                
                if (response.isSuccessful && response.body() != null) {
                    val apiResponse = response.body()!!
                    if (apiResponse.success && apiResponse.data != null) {
                        val linkData = apiResponse.data
                        val url = "https://tembus.my.id/pay/${linkData.id}"
                        _uiState.value = BusinessUiState.Success(url)
                    } else {
                        _uiState.value = BusinessUiState.Error("Gagal membuat link: ${apiResponse.message}")
                    }
                } else {
                    val errorMsg = response.errorBody()?.string() ?: "Unknown error"
                    _uiState.value = BusinessUiState.Error("Gagal membuat link: $errorMsg")
                }
            } catch (e: Exception) {
                _uiState.value = BusinessUiState.Error(e.localizedMessage ?: "Terjadi kesalahan")
            }
        }
    }

    fun resetState() {
        _uiState.value = BusinessUiState.Idle
    }
}
