package com.tembus.customer.domain.config

import javax.inject.Inject
import javax.inject.Singleton

/** Starts non-critical configuration work without holding the native startup shell. */
@Singleton
class AppStartupCoordinator @Inject constructor(
    private val experienceConfigManager: ExperienceConfigManager,
    private val startupCampaignCoordinator: StartupCampaignCoordinator,
) {
    fun start() {
        experienceConfigManager.start()
        startupCampaignCoordinator.start()
    }
}
