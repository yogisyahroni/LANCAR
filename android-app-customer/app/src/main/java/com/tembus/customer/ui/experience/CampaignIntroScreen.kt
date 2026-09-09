package com.tembus.customer.ui.experience

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.tembus.customer.domain.config.StartupCampaignDecision
import java.io.File
import kotlinx.coroutines.delay

/**
 * Post-splash campaign layer. It only consumes a verified local asset path;
 * Coil is never given the manifest's remote URI.
 */
@Composable
fun CampaignIntroScreen(
    decision: StartupCampaignDecision,
    onSkip: () -> Unit,
    onDismiss: () -> Unit,
    onAssetError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(
        decision.campaign.campaignId,
        decision.campaign.displayDurationSeconds,
        decision.campaign.maxDurationSeconds,
    ) {
        // The campaign layer can never hold the user at startup indefinitely.
        delay(
            decision.campaign.displayDurationSeconds
                .coerceAtMost(decision.campaign.maxDurationSeconds)
                .coerceIn(1, 120) * 1_000L,
        )
        onSkip()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.56f))
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 14.dp),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (decision.campaign.dismissible) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Tutup")
                        }
                    }
                }
                if (decision.assetPath != null) {
                    AsyncImage(
                        model = decision.assetPath.let { path ->
                            if (path.startsWith("file:")) path else File(path)
                        },
                        contentDescription = decision.campaign.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(190.dp),
                        onError = { onAssetError() },
                    )
                } else {
                    Surface(
                        modifier = Modifier.size(88.dp),
                        shape = RoundedCornerShape(24.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.Campaign,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(42.dp),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(18.dp))
                Text(
                    text = decision.campaign.title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center,
                )
                decision.campaign.body?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
                if (decision.campaign.skippable || decision.campaign.dismissible) {
                    Spacer(Modifier.height(18.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (decision.campaign.skippable) {
                            OutlinedButton(
                                onClick = onSkip,
                                modifier = Modifier.weight(1f),
                            ) { Text("Lewati") }
                        }
                        if (decision.campaign.dismissible) {
                            Button(
                                onClick = onDismiss,
                                modifier = Modifier.weight(1f),
                            ) { Text("Tutup") }
                        }
                    }
                }
            }
        }
    }
}
