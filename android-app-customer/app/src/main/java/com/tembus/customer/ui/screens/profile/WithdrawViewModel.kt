package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.WithdrawLimits
import com.tembus.customer.data.model.WithdrawRequest
import com.tembus.customer.data.model.WithdrawResponse
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * State untuk dialog Tarik Dana.
 *
 * PENTING: Setiap kali dialog dibuka, idempotencyKey harus di-regenerate
 * agar setiap percobaan withdrawal memiliki key unik. Ini mencegah
 * replay attack dan double-debit jika user membuka dialog beberapa kali.
 */
sealed class WithdrawUiState {
    /** Dialog belum dibuka — tidak ada aksi */
    object Idle : WithdrawUiState()

    /** Sedang memproses request ke server */
    object Loading : WithdrawUiState()

    /**
     * Validasi input gagal di sisi client.
     * Ditampilkan sebagai inline error di form (bukan pop-up) agar UX lebih baik.
     */
    data class ValidationError(val message: String) : WithdrawUiState()

    /**
     * Server menolak request (4xx) atau terjadi error jaringan.
     * Ditampilkan sebagai Snackbar/Dialog error.
     */
    data class Error(val message: String) : WithdrawUiState()

    /**
     * Permintaan berhasil diterima server (202 Accepted).
     * Dana sedang diproses (async disbursement).
     */
    data class Success(val response: WithdrawResponse) : WithdrawUiState()
}

@HiltViewModel
class WithdrawViewModel @Inject constructor(
    private val api: TEMBUSApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow<WithdrawUiState>(WithdrawUiState.Idle)
    val uiState: StateFlow<WithdrawUiState> = _uiState.asStateFlow()

    /**
     * Idempotency key dibangkitkan SATU kali per session dialog.
     * Key ini di-regenerate saat ViewModel di-reset (reset()) agar
     * setiap pembukaan dialog baru mendapat key yang berbeda.
     *
     * SECURITY: UUID v4 memiliki 122 bit entropy — secara kriptografis aman
     * sebagai one-time nonce untuk mencegah replay attack.
     */
    private var currentIdempotencyKey: String = generateIdempotencyKey()

    /**
     * Mengambil idempotency key aktif untuk ditampilkan di UI (untuk debug)
     * atau dikirim ke API.
     */
    fun getIdempotencyKey(): String = currentIdempotencyKey

    /**
     * Validasi dan submit permintaan tarik dana.
     *
     * Alur keamanan:
     * 1. Validasi input di client (defense layer 1)
     * 2. Build WithdrawRequest dengan tipe data yang benar (int64, bukan float)
     * 3. Kirim ke backend dengan Idempotency-Key header
     * 4. Backend memvalidasi ulang semua input (defense layer 2 — zero-trust)
     *
     * @param amountText Teks dari input field — akan diparse sebagai Long
     * @param accountNumber Nomor rekening yang sudah diketik user
     * @param accountHolder Nama pemilik rekening
     * @param bankCode Kode bank yang dipilih (BCA, BNI, dll)
     */
    fun submitWithdraw(
        amountText: String,
        accountNumber: String,
        accountHolder: String,
        bankCode: String
    ) {
        viewModelScope.launch {
            // ─── CLIENT-SIDE VALIDATION (Layer 1) ─────────────────────────────
            // Validasi ini harus sama persis dengan validasi di backend Go.
            // Tujuan: memberikan feedback instan ke user tanpa menunggu round-trip.

            // 1. Parse amount — tolak jika bukan integer murni
            val amount = amountText.trim().toLongOrNull()
            if (amount == null || amount <= 0L) {
                _uiState.value = WithdrawUiState.ValidationError(
                    "Jumlah penarikan harus berupa angka bulat positif"
                )
                return@launch
            }

            // 2. Amount minimum
            if (amount < WithdrawLimits.MIN_AMOUNT) {
                _uiState.value = WithdrawUiState.ValidationError(
                    "Minimum penarikan adalah Rp 10.000"
                )
                return@launch
            }

            // 3. Amount maksimum per transaksi
            if (amount > WithdrawLimits.MAX_AMOUNT) {
                _uiState.value = WithdrawUiState.ValidationError(
                    "Maksimum penarikan per transaksi adalah Rp 50.000.000"
                )
                return@launch
            }

            // 4. Validasi nomor rekening — hanya digit 0-9, 10-18 karakter
            // Ini mencegah SQL injection, XSS, command injection via account number.
            val trimmedAccount = accountNumber.trim()
            if (!WithdrawLimits.isValidAccountNumber(trimmedAccount)) {
                _uiState.value = WithdrawUiState.ValidationError(
                    "Nomor rekening harus terdiri dari 10-18 digit angka saja (tanpa tanda baca atau huruf)"
                )
                return@launch
            }

            // 5. Validasi nama pemilik rekening — whitelist chars
            val trimmedHolder = accountHolder.trim()
            if (!WithdrawLimits.isValidAccountHolder(trimmedHolder)) {
                _uiState.value = WithdrawUiState.ValidationError(
                    "Nama pemilik rekening hanya boleh mengandung huruf, spasi, titik, dan apostrof"
                )
                return@launch
            }

            // 6. Validasi kode bank
            val upperBankCode = bankCode.trim().uppercase()
            if (!WithdrawLimits.isValidBankCode(upperBankCode)) {
                _uiState.value = WithdrawUiState.ValidationError(
                    "Pilih bank yang valid"
                )
                return@launch
            }

            // ─── BUILD REQUEST ──────────────────────────────────────────────────
            val request = WithdrawRequest(
                amount = amount,
                accountNumber = trimmedAccount,
                accountHolder = trimmedHolder,
                bankCode = upperBankCode,
                idempotencyKey = currentIdempotencyKey
            )

            // ─── SUBMIT TO API ──────────────────────────────────────────────────
            _uiState.value = WithdrawUiState.Loading

            runCatching {
                // Idempotency-Key dikirim JUGA sebagai HTTP header (RFC 7231 extension)
                // agar gateway/load-balancer bisa melakukan dedup di level infrastruktur
                api.requestWithdraw(
                    idempotencyKey = currentIdempotencyKey,
                    request = request
                )
            }.onSuccess { response ->
                if (response.isSuccessful) {
                    val body = response.body()
                    _uiState.value = WithdrawUiState.Success(
                        body?.data ?: WithdrawResponse(
                            message = "Permintaan diterima",
                            status = "pending"
                        )
                    )
                } else {
                    // HTTP 4xx: backend menolak — parse error message
                    val errorMsg = when (response.code()) {
                        400 -> "Data tidak valid. Periksa kembali nomor rekening dan jumlah penarikan."
                        409 -> "Permintaan yang sama sudah pernah dikirim. Silakan tunggu konfirmasi."
                        422 -> "Saldo tidak mencukupi atau melebihi limit harian."
                        429 -> "Terlalu banyak percobaan. Coba lagi dalam beberapa menit."
                        503 -> "Layanan pembayaran sedang tidak tersedia. Coba lagi nanti."
                        else -> "Permintaan penarikan gagal (kode: ${response.code()})"
                    }
                    _uiState.value = WithdrawUiState.Error(errorMsg)
                }
            }.onFailure { exception ->
                _uiState.value = WithdrawUiState.Error(
                    "Gagal terhubung ke server: ${exception.message}"
                )
            }
        }
    }

    /**
     * Reset state ke Idle dan bangkitkan idempotency key baru.
     * WAJIB dipanggil saat dialog ditutup atau setelah success/error
     * agar percobaan berikutnya menggunakan key yang berbeda.
     */
    fun reset() {
        _uiState.value = WithdrawUiState.Idle
        currentIdempotencyKey = generateIdempotencyKey()
    }

    private fun generateIdempotencyKey(): String {
        // UUID.randomUUID() menggunakan SecureRandom secara internal di Android
        // Menghasilkan UUID v4 (randomly generated) — 122 bit entropy
        return UUID.randomUUID().toString()
    }
}
