package com.tembus.customer.domain.config

import com.tembus.customer.data.config.model.ExperienceConfigSnapshot

/**
 * During migration, legacy global_banners is only a compatibility fallback.
 * A resolved Experience manifest owns home presentation whenever it has safe
 * sections, so two admin sources cannot render conflicting banners together.
 */
fun shouldRenderLegacyGlobalBanner(snapshot: ExperienceConfigSnapshot): Boolean =
    snapshot.manifest.sections.isEmpty()
