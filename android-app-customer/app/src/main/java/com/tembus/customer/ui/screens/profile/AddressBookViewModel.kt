package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.CustomerAddress
import com.tembus.customer.data.model.CustomerAddressRequest
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// C5: ViewModel address book multi-alamat
@HiltViewModel
class AddressBookViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    private val _addresses = MutableStateFlow<List<CustomerAddress>>(emptyList())
    val addresses: StateFlow<List<CustomerAddress>> = _addresses.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun loadAddresses() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                val result = repository.getCustomerAddresses("receiver")
                result.onSuccess { list ->
                    _addresses.value = list.sortedByDescending { it.isFavorite }
                }.onFailure { e ->
                    _error.value = e.message ?: "Gagal memuat alamat"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Gagal memuat alamat"
            } finally {
                _loading.value = false
            }
        }
    }

    fun createAddress(request: CustomerAddressRequest) {
        viewModelScope.launch {
            try {
                repository.createCustomerAddress(request).onFailure { e ->
                    _error.value = e.message ?: "Gagal menyimpan alamat"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Gagal menyimpan alamat"
            } finally {
                loadAddresses()
            }
        }
    }

    fun updateAddress(id: String, request: CustomerAddressRequest) {
        viewModelScope.launch {
            try {
                repository.updateCustomerAddress(id, request).onFailure { e ->
                    _error.value = e.message ?: "Gagal memperbarui alamat"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Gagal memperbarui alamat"
            } finally {
                loadAddresses()
            }
        }
    }

    fun deleteAddress(id: String) {
        viewModelScope.launch {
            try {
                repository.deleteCustomerAddress(id).onFailure { e ->
                    _error.value = e.message ?: "Gagal menghapus alamat"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Gagal menghapus alamat"
            } finally {
                loadAddresses()
            }
        }
    }
}
