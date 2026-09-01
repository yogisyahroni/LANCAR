package com.tembus.customer.ui.screens.booking

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import com.tembus.customer.ui.localization.CustomerText as Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryPale
import com.tembus.customer.ui.theme.TembusRadius

private val Ink = OnSurface
private val Muted = OnSurfaceVariant

@Composable
internal fun BookingStepContent(
    state: BookingState,
    currentStep: Int,
    locationEnabled: Boolean,
    contentPadding: PaddingValues,
    context: Context,
    viewModel: BookingViewModel,
    onStepChange: (Int) -> Unit,
    onOpenServicePicker: () -> Unit,
    onPickupClick: () -> Unit,
    onDestinationClick: () -> Unit,
    onRequestLocationClick: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        contentPadding = PaddingValues(top = 14.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            BookingProgressPills(
                state = state,
                currentStep = currentStep,
                onStepSelect = { step ->
                    if (step == 1) {
                        onStepChange(1)
                    } else if (step == 2) {
                        if (state.isRouteComplete() && state.isPackageReady() && state.selectedPrice() != null) {
                            onStepChange(2)
                        } else {
                            Toast.makeText(context, "Lengkapi rute dan layanan pada Langkah 1 terlebih dahulu.", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            )
        }
        if (currentStep == 1) {
            item {
                DeliveryDetailCard(
                    state = state,
                    onPickupClick = onPickupClick,
                    onDestinationClick = onDestinationClick,
                    onRequestLocationClick = onRequestLocationClick
                )
            }
            if (state.promoCode.isNotBlank()) {
                item {
                    PreselectedPromoCard(
                        promoCode = state.promoCode,
                        onClear = viewModel::clearPromoCode
                    )
                }
            }
            item {
                VoucherCard(
                    state = state,
                    onCodeChange = viewModel::setVoucherCode,
                    onApply = viewModel::validateVoucher,
                    onClear = viewModel::clearVoucher
                )
            }
            if (state.isRouteComplete()) {
                item {
                    PackageCard(
                        state = state,
                        onTierSelected = viewModel::setSizeTier
                    )
                }
                item {
                    ServiceInlinePreview(
                        state = state,
                        onChooseService = onOpenServicePicker
                    )
                }
                if (state.isCalculatingRoute) {
                    item { RoutePricingProgressCard() }
                } else if (state.selectedPrice() != null) {
                    item {
                        RoutePreviewCard(
                            state = state,
                            locationEnabled = locationEnabled
                        )
                    }
                } else if (state.isPackageReady() && state.priceBreakdowns.isEmpty()) {
                    item { RouteUnavailableCard() }
                }
            } else {
                item { BookingStepHintCard() }
            }
        } else if (currentStep == 2) {
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(TembusRadius.Card),
                    colors = CardDefaults.cardColors(containerColor = PrimaryPale),
                    border = BorderStroke(1.dp, Outline)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Rute & Layanan Terpilih", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Primary)
                            Spacer(Modifier.height(4.dp))
                            Text("${state.pickupAddress.take(22)}... ke ${state.destinationAddress.take(22)}...", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Ink)
                            Text("${state.selectedService()?.name ?: "TEMBUS"} • ${state.selectedSizeTier()?.name ?: ""} (${state.packageWeight} kg)", fontSize = 12.sp, color = Muted)
                        }
                        TextButton(onClick = { onStepChange(1) }) {
                            Text("Ubah", fontWeight = FontWeight.ExtraBold, color = Primary)
                        }
                    }
                }
            }
            item {
                RecipientCard(
                    state = state,
                    onNameChange = viewModel::setRecipientName,
                    onPhoneChange = viewModel::setRecipientPhone,
                    onItemChange = viewModel::setItemDescription
                )
            }
            item {
                AddOnCard(
                    deliveryCodeEnabled = state.deliveryCodeEnabled,
                    insuranceEnabled = state.insuranceEnabled,
                    onDeliveryCodeChange = viewModel::toggleDeliveryCode,
                    onInsuranceChange = viewModel::toggleInsurance
                )
            }
            if (state.promoCode.isNotBlank()) {
                item {
                    PreselectedPromoCard(
                        promoCode = state.promoCode,
                        onClear = viewModel::clearPromoCode
                    )
                }
            }
        }
    }
}
