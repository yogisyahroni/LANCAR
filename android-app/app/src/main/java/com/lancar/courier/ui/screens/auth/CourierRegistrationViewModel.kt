package com.lancar.courier.ui.screens.auth

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.api.LANCARApiService
import com.lancar.courier.data.model.CourierRegistrationRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject

data class CourierRegistrationUiState(
    val fullName: String = "",
    val phoneNumber: String = "",
    val email: String = "",
    val password: String = "",
    val vehiclePlate: String = "",
    val vehicleBrand: String = "",
    val vehicleModel: String = "",
    val vehicleYear: String = "",
    val vehicleCc: String = "",
    val vehicleCategory: String = "matic",
    val bankCode: String = "",
    val bankAccountNumber: String = "",
    val bankAccountName: String = "",
    val ktpRef: String = "",
    val simRef: String = "",
    val stnkRef: String = "",
    val skpdRef: String = "",
    val vehiclePhotoRef: String = "",
    val skckRef: String = "",
    val bankRef: String = "",
    val documentFileNames: Map<String, String> = emptyMap(),
    val uploadingDocType: String? = null,
    val simActive: Boolean = true,
    val skpdTaxActive: Boolean = true,
    val fourStroke: Boolean = true,
    val isLoading: Boolean = false,
    val isSubmitted: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class CourierRegistrationViewModel @Inject constructor(
    private val apiService: LANCARApiService,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow(CourierRegistrationUiState())
    val uiState: StateFlow<CourierRegistrationUiState> = _uiState.asStateFlow()

    fun update(transform: CourierRegistrationUiState.() -> CourierRegistrationUiState) {
        _uiState.update { current -> current.transform().copy(error = null) }
    }

    fun uploadDocument(docType: String, uri: Uri) {
        if (_uiState.value.uploadingDocType != null) return

        viewModelScope.launch {
            _uiState.update { it.copy(uploadingDocType = docType, error = null) }
            try {
                val uploaded = withContext(Dispatchers.IO) {
                    val resolver = appContext.contentResolver
                    val mimeType = resolver.getType(uri) ?: "application/octet-stream"
                    val fileName = queryDisplayName(uri) ?: "${docType}_${System.currentTimeMillis()}"
                    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: throw IllegalArgumentException("File tidak bisa dibaca")

                    if (bytes.size > 10 * 1024 * 1024) {
                        throw IllegalArgumentException("Ukuran file maksimal 10 MB")
                    }

                    val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
                    val part = MultipartBody.Part.createFormData("file", fileName, requestBody)
                    val docTypePart = docType.toRequestBody("text/plain".toMediaTypeOrNull())

                    val response = apiService.uploadCourierDocument(docTypePart, part)
                    if (!response.isSuccessful || response.body()?.success != true || response.body()?.data == null) {
                        throw IllegalStateException(response.body()?.message ?: "Upload dokumen gagal")
                    }
                    response.body()!!.data!!
                }

                _uiState.update { state ->
                    val fileNames = state.documentFileNames + (docType to uploaded.originalFileName.ifBlank { uploaded.fileUrl })
                    when (docType) {
                        "ktp" -> state.copy(ktpRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "sim" -> state.copy(simRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "stnk" -> state.copy(stnkRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "skpd" -> state.copy(skpdRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "vehicle_photo" -> state.copy(vehiclePhotoRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "skck" -> state.copy(skckRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "bank_account" -> state.copy(bankRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        else -> state.copy(documentFileNames = fileNames, uploadingDocType = null)
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(uploadingDocType = null, error = e.message ?: "Upload dokumen gagal")
                }
            }
        }
    }

    private fun queryDisplayName(uri: Uri): String? {
        return appContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }

    fun submit() {
        val state = _uiState.value
        val vehicleYear = state.vehicleYear.toIntOrNull() ?: 0
        val vehicleCc = state.vehicleCc.toIntOrNull() ?: 0
        val requiredMissing = listOf(
            state.fullName,
            state.phoneNumber,
            state.password,
            state.vehiclePlate,
            state.vehicleYear,
            state.vehicleCc,
            state.bankCode,
            state.bankAccountNumber,
            state.bankAccountName,
            state.ktpRef,
            state.simRef,
            state.stnkRef,
            state.skpdRef,
            state.vehiclePhotoRef,
            state.skckRef,
            state.bankRef
        ).any { it.isBlank() }

        if (requiredMissing) {
            _uiState.update { it.copy(error = "Lengkapi semua data dan referensi dokumen terlebih dahulu") }
            return
        }

        val currentYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
        if (vehicleYear <= 0 || currentYear - vehicleYear > 8) {
            _uiState.update { it.copy(error = "Umur kendaraan maksimal 8 tahun dari tahun pendaftaran") }
            return
        }

        if (vehicleCc <= 0 || vehicleCc > 250) {
            _uiState.update { it.copy(error = "Maksimal CC kendaraan 250 cc") }
            return
        }

        if (state.vehicleCategory in listOf("trail", "sport", "touring")) {
            _uiState.update { it.copy(error = "Motor Trail, Sport, dan Touring tidak dapat didaftarkan") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val request = CourierRegistrationRequest(
                    fullName = state.fullName,
                    phoneNumber = state.phoneNumber,
                    email = state.email,
                    password = state.password,
                    vehicleType = state.vehicleCategory,
                    vehiclePlate = state.vehiclePlate,
                    vehicleBrand = state.vehicleBrand,
                    vehicleModel = state.vehicleModel,
                    vehicleYear = vehicleYear,
                    vehicleCc = vehicleCc,
                    vehicleCategory = state.vehicleCategory,
                    engineType = if (state.fourStroke) "4_tak" else "2_tak",
                    simActive = state.simActive,
                    skpdTaxActive = state.skpdTaxActive,
                    bankCode = state.bankCode,
                    bankAccountNumber = state.bankAccountNumber,
                    bankAccountName = state.bankAccountName,
                    documents = mapOf(
                        "ktp" to state.ktpRef,
                        "sim" to state.simRef,
                        "stnk" to state.stnkRef,
                        "skpd" to state.skpdRef,
                        "vehicle_photo" to state.vehiclePhotoRef,
                        "skck" to state.skckRef,
                        "bank_account" to state.bankRef
                    )
                )
                val response = apiService.registerCourier(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    _uiState.update { it.copy(isLoading = false, isSubmitted = true) }
                } else {
                    _uiState.update {
                        it.copy(isLoading = false, error = response.body()?.message ?: "Pendaftaran gagal dikirim")
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "Pendaftaran gagal dikirim") }
            }
        }
    }
}
