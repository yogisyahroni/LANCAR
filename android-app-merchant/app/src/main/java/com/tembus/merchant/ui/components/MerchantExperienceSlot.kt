package com.tembus.merchant.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.ExperienceManifest
import com.tembus.merchant.data.model.ExperienceSection
import com.tembus.merchant.data.repository.ExperienceConfigRepository

/** Renders only bounded operational content; it cannot navigate or mutate orders. */
@Composable
fun MerchantExperienceSlot(
    repository: ExperienceConfigRepository,
    modifier: Modifier = Modifier,
) {
    val manifest = produceState<ExperienceManifest?>(initialValue = null, repository) {
        value = repository.load()
    }.value ?: return
    val sections = manifest.sections.filter { it.component in RENDERABLE_COMPONENTS }
    if (sections.isEmpty()) return

    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 220.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        sections.forEach { section -> MerchantExperienceCard(section) }
    }
}

@Composable
private fun MerchantExperienceCard(section: ExperienceSection) {
    val title = section.properties["title"]?.toString()?.trim().orEmpty()
    val body = section.properties["body"]?.toString()?.trim().orEmpty()
    val labels = (section.properties["actions"] as? List<*>)
        ?.mapNotNull { (it as? Map<*, *>)?.get("label")?.toString()?.trim() }
        ?.filter { it.isNotBlank() }
        .orEmpty()
    if (title.isBlank() && body.isBlank() && labels.isEmpty()) return

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (title.isNotBlank()) Text(title, style = MaterialTheme.typography.titleSmall)
            if (body.isNotBlank()) Text(body, style = MaterialTheme.typography.bodySmall)
            labels.forEach { label -> Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
        }
    }
}

private val RENDERABLE_COMPONENTS = setOf("campaign_strip", "info_card", "notice", "quick_actions")
