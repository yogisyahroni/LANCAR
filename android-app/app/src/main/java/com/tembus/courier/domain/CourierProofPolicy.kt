package com.tembus.courier.domain

/**
 * Contactless delivery replaces physical recipient handoff with a drop-off
 * photo. A normal delivery still requires the existing signature step.
 */
fun requiresRecipientSignature(contactless: Boolean, isPickupProof: Boolean): Boolean =
    !isPickupProof && !contactless
