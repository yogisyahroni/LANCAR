package com.tembus.courier.ui.screens.auth

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.CourierRegistrationRequest
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
import org.json.JSONObject
import javax.inject.Inject

data class CourierRegistrationUiState(
    val currentStep: Int = 1,
    val hasUnsavedDraft: Boolean = false,
    val isOcrVerified: Boolean = false,
    val fullName: String = "",
    val nik: String = "",
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
    val faceEnrollmentRef: String = "",
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
    private val apiService: TEMBUSApiService,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow(CourierRegistrationUiState())
    val uiState: StateFlow<CourierRegistrationUiState> = _uiState.asStateFlow()

    private val sharedPrefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            "courier_registration_draft",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    init {
        restoreDraft()
    }

    fun update(transform: CourierRegistrationUiState.() -> CourierRegistrationUiState) {
        _uiState.update { current ->
            val next = current.transform().copy(error = null)
            saveDraftToPrefs(next)
            next
        }
    }

    fun nextStep() {
        val state = _uiState.value
        when (state.currentStep) {
            1 -> {
                if (state.nik.isBlank() || state.fullName.isBlank() || state.phoneNumber.isBlank() || state.email.isBlank() || state.password.isBlank()) {
                    _uiState.update { it.copy(error = "Harap lengkapi Data Diri terlebih dahulu") }
                    return
                }
                if (state.nik.length != 16) {
                    _uiState.update { it.copy(error = "NIK harus 16 digit") }
                    return
                }
                if (state.password.length < 8) {
                    _uiState.update { it.copy(error = "Password minimal 8 karakter") }
                    return
                }
            }
            2 -> {
                if (state.vehiclePlate.isBlank() || state.vehicleBrand.isBlank() || state.vehicleModel.isBlank() || state.vehicleYear.isBlank() || state.vehicleCc.isBlank()) {
                    _uiState.update { it.copy(error = "Harap lengkapi detail Kendaraan") }
                    return
                }
            }
            3 -> {
                if (state.bankCode.isBlank() || state.bankAccountNumber.isBlank() || state.bankAccountName.isBlank()) {
                    _uiState.update { it.copy(error = "Harap lengkapi Rekening Bank") }
                    return
                }
            }
        }
        _uiState.update { current ->
            val next = current.copy(currentStep = (current.currentStep + 1).coerceAtMost(4), error = null)
            saveDraftToPrefs(next)
            next
        }
    }

    fun previousStep() {
        _uiState.update { current ->
            val next = current.copy(currentStep = (current.currentStep - 1).coerceAtLeast(1), error = null)
            saveDraftToPrefs(next)
            next
        }
    }

    fun setStep(step: Int) {
        if (step in 1..4) {
            _uiState.update { current ->
                val next = current.copy(currentStep = step, error = null)
                saveDraftToPrefs(next)
                next
            }
        }
    }

    private fun saveDraftToPrefs(state: CourierRegistrationUiState) {
        if (state.isSubmitted) return
        try {
            val json = JSONObject().apply {
                put("currentStep", state.currentStep)
                put("fullName", state.fullName)
                put("nik", state.nik)
                put("phoneNumber", state.phoneNumber)
                put("email", state.email)
                put("password", state.password)
                put("vehiclePlate", state.vehiclePlate)
                put("vehicleBrand", state.vehicleBrand)
                put("vehicleModel", state.vehicleModel)
                put("vehicleYear", state.vehicleYear)
                put("vehicleCc", state.vehicleCc)
                put("vehicleCategory", state.vehicleCategory)
                put("bankCode", state.bankCode)
                put("bankAccountNumber", state.bankAccountNumber)
                put("bankAccountName", state.bankAccountName)
                put("ktpRef", state.ktpRef)
                put("simRef", state.simRef)
                put("stnkRef", state.stnkRef)
                put("skpdRef", state.skpdRef)
                put("vehiclePhotoRef", state.vehiclePhotoRef)
                put("skckRef", state.skckRef)
                put("bankRef", state.bankRef)
                put("faceEnrollmentRef", state.faceEnrollmentRef)
                put("simActive", state.simActive)
                put("skpdTaxActive", state.skpdTaxActive)
                put("fourStroke", state.fourStroke)
                put("isOcrVerified", state.isOcrVerified)
                val docNamesJson = JSONObject(state.documentFileNames as Map<*, *>)
                put("documentFileNames", docNamesJson)
            }
            sharedPrefs.edit().putString("draft_json", json.toString()).apply()
        } catch (e: Exception) {
            // ignore save errors
        }
    }

    private fun restoreDraft() {
        try {
            val jsonStr = sharedPrefs.getString("draft_json", null) ?: return
            val json = JSONObject(jsonStr)
            val docNamesJson = json.optJSONObject("documentFileNames")
            val docNamesMap = mutableMapOf<String, String>()
            if (docNamesJson != null) {
                docNamesJson.keys().forEach { key ->
                    docNamesMap[key] = docNamesJson.optString(key)
                }
            }
            _uiState.update { current ->
                current.copy(
                    currentStep = json.optInt("currentStep", 1),
                    fullName = json.optString("fullName", ""),
                    nik = json.optString("nik", ""),
                    phoneNumber = json.optString("phoneNumber", ""),
                    email = json.optString("email", ""),
                    password = json.optString("password", ""),
                    vehiclePlate = json.optString("vehiclePlate", ""),
                    vehicleBrand = json.optString("vehicleBrand", ""),
                    vehicleModel = json.optString("vehicleModel", ""),
                    vehicleYear = json.optString("vehicleYear", ""),
                    vehicleCc = json.optString("vehicleCc", ""),
                    vehicleCategory = json.optString("vehicleCategory", "matic"),
                    bankCode = json.optString("bankCode", ""),
                    bankAccountNumber = json.optString("bankAccountNumber", ""),
                    bankAccountName = json.optString("bankAccountName", ""),
                    ktpRef = json.optString("ktpRef", ""),
                    simRef = json.optString("simRef", ""),
                    stnkRef = json.optString("stnkRef", ""),
                    skpdRef = json.optString("skpdRef", ""),
                    vehiclePhotoRef = json.optString("vehiclePhotoRef", ""),
                    skckRef = json.optString("skckRef", ""),
                    bankRef = json.optString("bankRef", ""),
                    faceEnrollmentRef = json.optString("faceEnrollmentRef", ""),
                    simActive = json.optBoolean("simActive", true),
                    skpdTaxActive = json.optBoolean("skpdTaxActive", true),
                    fourStroke = json.optBoolean("fourStroke", true),
                    isOcrVerified = json.optBoolean("isOcrVerified", false),
                    documentFileNames = docNamesMap,
                    hasUnsavedDraft = true
                )
            }
        } catch (e: Exception) {
            // ignore restore errors
        }
    }

    fun clearDraft() {
        try {
            sharedPrefs.edit().clear().apply()
        } catch (e: Exception) {}
        _uiState.update { CourierRegistrationUiState() }
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
                    val nextState = when (docType) {
                        "ktp" -> state.copy(ktpRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "sim" -> state.copy(simRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "stnk" -> state.copy(stnkRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "skpd" -> state.copy(skpdRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "vehicle_photo" -> state.copy(vehiclePhotoRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "skck" -> state.copy(skckRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "bank_account" -> state.copy(bankRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        "face_enrollment" -> state.copy(faceEnrollmentRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                        else -> state.copy(documentFileNames = fileNames, uploadingDocType = null)
                    }
                    saveDraftToPrefs(nextState)
                    nextState
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(uploadingDocType = null, error = e.message ?: "Upload dokumen gagal")
                }
            }
        }
    }

    /** Upload foto wajah dari kamera live (bukan galeri) saat pendaftaran kurir */
    fun uploadFaceEnrollmentBitmap(bitmap: Bitmap) {
        if (_uiState.value.uploadingDocType != null) return
        viewModelScope.launch {
            _uiState.update { it.copy(uploadingDocType = "face_enrollment", error = null) }
            try {
                val bytes = withContext(Dispatchers.IO) {
                    val stream = java.io.ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
                    stream.toByteArray()
                }
                if (bytes.size > 10 * 1024 * 1024) {
                    throw IllegalArgumentException("Foto melebihi batas 10 MB")
                }
                val fileName = "face_enrollment_${System.currentTimeMillis()}.jpg"
                val requestBody = bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("file", fileName, requestBody)
                val docTypePart = "face_enrollment".toRequestBody("text/plain".toMediaTypeOrNull())
                val response = withContext(Dispatchers.IO) { apiService.uploadCourierDocument(docTypePart, part) }
                if (!response.isSuccessful || response.body()?.success != true || response.body()?.data == null) {
                    throw IllegalStateException(response.body()?.message ?: "Upload foto wajah gagal")
                }
                val uploaded = response.body()!!.data!!
                _uiState.update { state ->
                    val fileNames = state.documentFileNames + ("face_enrollment" to "Foto wajah terupload")
                    val nextState = state.copy(faceEnrollmentRef = uploaded.fileUrl, documentFileNames = fileNames, uploadingDocType = null)
                    saveDraftToPrefs(nextState)
                    nextState
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(uploadingDocType = null, error = e.message ?: "Upload foto wajah gagal") }
            }
        }
    }

    /** Upload KTP dari kamera live dan set NIK / Nama dari hasil OCR */
    fun uploadKtpBitmap(bitmap: Bitmap, nik: String?, name: String?) {
        if (_uiState.value.uploadingDocType != null) return
        viewModelScope.launch {
            _uiState.update { it.copy(uploadingDocType = "ktp", error = null) }
            try {
                val bytes = withContext(Dispatchers.IO) {
                    val stream = java.io.ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
                    stream.toByteArray()
                }
                if (bytes.size > 10 * 1024 * 1024) {
                    throw IllegalArgumentException("Foto KTP melebihi batas 10 MB")
                }
                val fileName = "ktp_${System.currentTimeMillis()}.jpg"
                val requestBody = bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("file", fileName, requestBody)
                val docTypePart = "ktp".toRequestBody("text/plain".toMediaTypeOrNull())
                val response = withContext(Dispatchers.IO) { apiService.uploadCourierDocument(docTypePart, part) }
                if (!response.isSuccessful || response.body()?.success != true || response.body()?.data == null) {
                    throw IllegalStateException(response.body()?.message ?: "Upload KTP gagal")
                }
                val uploaded = response.body()!!.data!!
                _uiState.update { state ->
                    val fileNames = state.documentFileNames + ("ktp" to "KTP terupload")
                    val nextState = state.copy(
                        ktpRef = uploaded.fileUrl, 
                        documentFileNames = fileNames, 
                        uploadingDocType = null,
                        nik = nik ?: state.nik,
                        fullName = if (name.isNullOrBlank()) state.fullName else name,
                        isOcrVerified = !nik.isNullOrBlank() || !name.isNullOrBlank()
                    )
                    saveDraftToPrefs(nextState)
                    nextState
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(uploadingDocType = null, error = e.message ?: "Upload KTP gagal") }
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
            state.nik,
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
            state.bankRef,
            state.faceEnrollmentRef
        ).any { it.isBlank() }

        if (requiredMissing) {
            _uiState.update { it.copy(error = "Harap lengkapi semua data wajib") }
            return
        }

        if (state.password.length < 8) {
            _uiState.update { it.copy(error = "Password minimal 8 karakter") }
            return
        }
        
        if (state.nik.length != 16) {
            _uiState.update { it.copy(error = "NIK harus 16 digit") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val request = CourierRegistrationRequest(
                    fullName = state.fullName,
                    nik = state.nik,
                    email = state.email,
                    phoneNumber = state.phoneNumber,
                    password = state.password,
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
                        "bank_account" to state.bankRef,
                        "face_enrollment" to state.faceEnrollmentRef
                    )
                )
                val response = apiService.registerCourier(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    try { sharedPrefs.edit().clear().apply() } catch (e: Exception) {}
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
