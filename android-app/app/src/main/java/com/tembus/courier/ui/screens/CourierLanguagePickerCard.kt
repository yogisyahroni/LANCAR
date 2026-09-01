package com.tembus.courier.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tembus.courier.R
import com.tembus.courier.data.localization.LocaleManager
import kotlinx.coroutines.launch

@Composable
internal fun CourierLanguagePickerCard() {
    val context = LocalContext.current
    val manager = remember(context.applicationContext) { LocaleManager(context.applicationContext) }
    val currentCode by manager.languageCode.collectAsState(initial = LocaleManager.DEFAULT_LANG)
    val scope = rememberCoroutineScope()
    var showPicker by remember { mutableStateOf(false) }

    Card(
        onClick = { showPicker = true },
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(Icons.Default.Language, contentDescription = null)
            Column(modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.courier_language), style = MaterialTheme.typography.titleMedium)
                Text(
                    stringResource(R.string.courier_language_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(LocaleManager.AppLanguage.values().first { it.code == currentCode }.label)
        }
    }

    if (showPicker) {
        AlertDialog(
            onDismissRequest = { showPicker = false },
            title = { Text(stringResource(R.string.courier_language)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LocaleManager.AppLanguage.values().forEach { language ->
                        TextButton(
                            onClick = {
                                showPicker = false
                                scope.launch { manager.setLanguage(language.code) }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(language.label, modifier = Modifier.weight(1f))
                            if (language.code == currentCode) {
                                Icon(Icons.Default.Check, contentDescription = null)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showPicker = false }) {
                    Text(stringResource(R.string.courier_close))
                }
            }
        )
    }
}
