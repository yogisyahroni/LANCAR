package com.tembus.customer.ui.screens.booking

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.text.AnnotatedString

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun BookingModalSheets(
    state: BookingState,
    viewModel: BookingViewModel,
    context: Context,
    clipboardManager: ClipboardManager,
    showServiceSheet: Boolean,
    showPickupSheet: Boolean,
    showDestinationSheet: Boolean,
    showLocationRequestSheet: Boolean,
    showReviewSheet: Boolean,
    onServiceSheetDismiss: () -> Unit,
    onPickupSheetDismiss: () -> Unit,
    onDestinationSheetDismiss: () -> Unit,
    onLocationRequestSheetDismiss: () -> Unit,
    onReviewSheetDismiss: () -> Unit,
) {
    if (showServiceSheet) {
        ModalBottomSheet(
            onDismissRequest = onServiceSheetDismiss,
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            ServicePickerSheet(
                state = state,
                onSelect = {
                    viewModel.selectService(it)
                    onServiceSheetDismiss()
                }
            )
        }
    }

    if (showDestinationSheet) {
        ModalBottomSheet(
            onDismissRequest = {
                viewModel.clearLocationSearch()
                onDestinationSheetDismiss()
            },
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            LocationInputSheet(
                title = "Kirim paket ke mana?",
                subtitle = "Cari alamat tujuan lalu pilih hasil yang paling sesuai agar harga dan rute dihitung dari data nyata.",
                buttonLabel = "Gunakan alamat tujuan",
                savedAddresses = state.addressBook.filter { it.kind == "receiver" || it.kind == "both" },
                addressKind = "receiver",
                geocodeResults = state.geocodeResults,
                isSearchingLocation = state.isSearchingLocation,
                geocodeError = state.geocodeError,
                selectedMapLocation = state.mapPickerLocation,
                selectedMapAddress = state.mapPickerAddress,
                isResolvingMapPoint = state.isResolvingMapPoint,
                onSearch = viewModel::searchAddress,
                onGeocodeSelected = viewModel::selectGeocodeResult,
                onSelect = { location, address ->
                    viewModel.setDestination(location, address)
                    viewModel.clearLocationSearch()
                    onDestinationSheetDismiss()
                },
                onSavedAddressSelected = { address ->
                    viewModel.selectSavedAddress(address, asPickup = false)
                    viewModel.clearLocationSearch()
                    onDestinationSheetDismiss()
                },
                onSaveAndSelect = { label, location, address ->
                    viewModel.saveAddressAndSelect(
                        label = label,
                        location = location,
                        address = address,
                        kind = "receiver",
                        asPickup = false
                    )
                    viewModel.clearLocationSearch()
                    onDestinationSheetDismiss()
                }
            )
        }
    }

    if (showPickupSheet) {
        ModalBottomSheet(
            onDismissRequest = {
                viewModel.clearLocationSearch()
                onPickupSheetDismiss()
            },
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            LocationInputSheet(
                title = "Ambil paket di mana?",
                subtitle = "Cari alamat pickup lalu pilih hasil yang paling sesuai supaya kurir menerima lokasi penjemputan yang akurat.",
                buttonLabel = "Gunakan alamat pickup",
                savedAddresses = state.addressBook.filter { it.kind == "pickup" || it.kind == "both" },
                addressKind = "pickup",
                geocodeResults = state.geocodeResults,
                isSearchingLocation = state.isSearchingLocation,
                geocodeError = state.geocodeError,
                selectedMapLocation = state.mapPickerLocation,
                selectedMapAddress = state.mapPickerAddress,
                isResolvingMapPoint = state.isResolvingMapPoint,
                onSearch = viewModel::searchAddress,
                onGeocodeSelected = viewModel::selectGeocodeResult,
                onSelect = { location, address ->
                    viewModel.setPickup(location, address)
                    viewModel.clearLocationSearch()
                    onPickupSheetDismiss()
                },
                onSavedAddressSelected = { address ->
                    viewModel.selectSavedAddress(address, asPickup = true)
                    viewModel.clearLocationSearch()
                    onPickupSheetDismiss()
                },
                onSaveAndSelect = { label, location, address ->
                    viewModel.saveAddressAndSelect(
                        label = label,
                        location = location,
                        address = address,
                        kind = "pickup",
                        asPickup = true
                    )
                    viewModel.clearLocationSearch()
                    onPickupSheetDismiss()
                }
            )
        }
    }

    if (showLocationRequestSheet) {
        ModalBottomSheet(
            onDismissRequest = onLocationRequestSheetDismiss,
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            RequestReceiverLocationSheet(
                link = state.receiverLocationLink?.url.orEmpty(),
                status = state.receiverLocationLink?.status,
                submittedAddress = state.receiverLocationLink?.submittedAddress,
                submittedContactName = state.receiverLocationLink?.submittedContactName,
                submittedContactPhone = state.receiverLocationLink?.submittedContactPhoneMasked,
                expiresAt = state.receiverLocationLink?.expiresAt,
                isLoading = state.isCreatingLocationLink,
                onCreateLink = viewModel::createReceiverLocationLink,
                onRefresh = viewModel::refreshReceiverLocationLink,
                onRevoke = viewModel::revokeReceiverLocationLink,
                onCopy = {
                    val link = state.receiverLocationLink?.url.orEmpty()
                    if (link.isNotBlank()) {
                        clipboardManager.setText(AnnotatedString(link))
                        Toast.makeText(context, "Link lokasi disalin", Toast.LENGTH_SHORT).show()
                    }
                },
                onShare = {
                    val link = state.receiverLocationLink?.url.orEmpty()
                    if (link.isNotBlank()) {
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(
                                Intent.EXTRA_TEXT,
                                "Halo, bantu isi titik tujuan pengiriman TEMBUS melalui link aman ini:\n$link"
                            )
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Bagikan link lokasi"))
                    }
                }
            )
        }
    }

    if (showReviewSheet) {
        ModalBottomSheet(
            onDismissRequest = onReviewSheetDismiss,
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            BookingReviewSheet(
                state = state,
                onSubmit = viewModel::confirmBooking
            )
        }
    }
}
