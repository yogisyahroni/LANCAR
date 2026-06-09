package com.tembus.courier.data.security

/**
 * FakeGpsAppDatabase — Known Fake GPS Application Registry
 *
 * Maintains a categorized database of known fake GPS applications by package name.
 * Used by FakeGpsDetector to scan installed apps on the device.
 *
 * Categories:
 *   - MOCK_LOCATION: Apps that directly inject mock location providers
 *   - JOYSTICK: Apps that provide joystick-style GPS manipulation
 *   - DEVELOPER_TOOL: Developer utilities that include mock location capability
 *   - GPS_SPOOFER: Standalone GPS spoofing apps
 *   - LOCATION_CHANGER: General-purpose location changing apps
 *
 * Legitimate developer tools (Android Studio, ADB Companion) are whitelisted
 * to avoid false positives.
 */
object FakeGpsAppDatabase {

    data class FakeGpsAppEntry(
        val packageName: String,
        val category: Category,
        val displayName: String
    )

    enum class Category {
        MOCK_LOCATION,
        JOYSTICK,
        DEVELOPER_TOOL,
        GPS_SPOOFER,
        LOCATION_CHANGER
    }

    /**
     * Core database of known fake GPS applications.
     * This list covers the most popular fake GPS apps on the Play Store
     * and sideload channels as of June 2026.
     */
    private val knownFakeGpsApps: List<FakeGpsAppEntry> = listOf(
        // ── Mock Location Providers ─────────────────────────────────
        FakeGpsAppEntry("com.lexa.fakegps", Category.MOCK_LOCATION, "Fake GPS Location"),
        FakeGpsAppEntry("com.incorporateapps.fakegps.fre", Category.MOCK_LOCATION, "Fake GPS Free"),
        FakeGpsAppEntry("com.incorporateapps.fakegps", Category.MOCK_LOCATION, "Fake GPS Pro"),
        FakeGpsAppEntry("com.fakegps.mock", Category.MOCK_LOCATION, "Fake GPS Mock"),
        FakeGpsAppEntry("com.blogspot.newapphorizons.fakegps", Category.MOCK_LOCATION, "Fake GPS"),
        FakeGpsAppEntry("com.lkr.fakelocation", Category.MOCK_LOCATION, "Fake Location"),
        FakeGpsAppEntry("com.gsmartstudio.fakegps", Category.MOCK_LOCATION, "Fake GPS Location Spoofer"),
        FakeGpsAppEntry("com.theappninjas.gpsjoystick", Category.MOCK_LOCATION, "GPS Joystick"),
        FakeGpsAppEntry("com.fakegps.route", Category.MOCK_LOCATION, "Fake GPS Route"),

        // ── Joystick Apps ───────────────────────────────────────────
        FakeGpsAppEntry("com.marlon.floating.fake.location", Category.JOYSTICK, "Floating Fake Location"),
        FakeGpsAppEntry("com.locationchanger", Category.JOYSTICK, "Location Changer"),
        FakeGpsAppEntry("com.evezzon.fakegps", Category.JOYSTICK, "Fake GPS Joystick & Routes Go"),
        FakeGpsAppEntry("com.rosteam.gpsemulator", Category.JOYSTICK, "GPS Emulator"),
        FakeGpsAppEntry("com.divi.fakeGPS", Category.JOYSTICK, "Fake GPS Joystick"),
        FakeGpsAppEntry("com.fake.gps.location.changer", Category.JOYSTICK, "Fake GPS Location Changer"),
        FakeGpsAppEntry("com.pe.fakegpsrun", Category.JOYSTICK, "Fake GPS Run"),

        // ── Developer Tools (that include mock capability) ──────────
        FakeGpsAppEntry("com.mustoverride.mocklocation", Category.DEVELOPER_TOOL, "Mock Locations"),
        FakeGpsAppEntry("ru.gavrikov.mocklocations", Category.DEVELOPER_TOOL, "Mock Locations for Developers"),
        FakeGpsAppEntry("com.location.fakemockgps", Category.DEVELOPER_TOOL, "Mock GPS Pro"),

        // ── GPS Spoofers ────────────────────────────────────────────
        FakeGpsAppEntry("com.ltp.pro.fakelocation", Category.GPS_SPOOFER, "Fake Location Pro"),
        FakeGpsAppEntry("com.fly.gps", Category.GPS_SPOOFER, "Fly GPS"),
        FakeGpsAppEntry("com.fakegps.joystick", Category.GPS_SPOOFER, "Fake GPS with Joystick"),
        FakeGpsAppEntry("com.mock.location.fake.gps", Category.GPS_SPOOFER, "Mock Location"),
        FakeGpsAppEntry("com.usefullapps.fakemylocation", Category.GPS_SPOOFER, "Fake My Location"),
        FakeGpsAppEntry("location.faker.fake.gps.location", Category.GPS_SPOOFER, "Location Faker"),
        FakeGpsAppEntry("com.fakegps.gps", Category.GPS_SPOOFER, "Fake GPS Location Setter"),
        FakeGpsAppEntry("com.lezyne.fakegps", Category.GPS_SPOOFER, "Lezyne Fake GPS"),

        // ── Location Changers ───────────────────────────────────────
        FakeGpsAppEntry("com.tenorshare.ianygo", Category.LOCATION_CHANGER, "iAnyGo"),
        FakeGpsAppEntry("com.aiseesoft.anycoord", Category.LOCATION_CHANGER, "AnyCoord"),
        FakeGpsAppEntry("com.virtuallocation.fake.gps.joystick", Category.LOCATION_CHANGER, "Virtual Location"),
        FakeGpsAppEntry("com.fakegps.gpslocation", Category.LOCATION_CHANGER, "GPS Location Faker"),
        FakeGpsAppEntry("com.fakeLocation.hola", Category.LOCATION_CHANGER, "Hola Fake GPS"),
    )

    /**
     * Package names of legitimate developer tools that MUST NOT trigger false positives.
     * These apps may request ACCESS_MOCK_LOCATION but are not GPS spoofing tools.
     */
    private val whitelistedPackages: Set<String> = setOf(
        "com.android.shell",
        "com.google.android.apps.maps",
        "com.google.android.gms",
        "com.google.android.setupwizard",
        "com.android.providers.settings",
        "com.android.settings",
    )

    /** Lookup set for O(1) package name matching */
    private val packageNameLookup: Set<String> by lazy {
        knownFakeGpsApps.map { it.packageName.lowercase() }.toSet()
    }

    /**
     * Check if a package name matches a known fake GPS application.
     *
     * @param packageName The package name to check (case-insensitive).
     * @return true if the package is a known fake GPS app and NOT whitelisted.
     */
    fun isKnownFakeGpsApp(packageName: String): Boolean {
        val normalized = packageName.lowercase()
        if (whitelistedPackages.contains(normalized)) return false
        return packageNameLookup.contains(normalized)
    }

    /**
     * Check if a package name is a whitelisted legitimate app.
     */
    fun isWhitelisted(packageName: String): Boolean {
        return whitelistedPackages.contains(packageName.lowercase())
    }

    /**
     * Get the full list of known fake GPS app entries.
     * Useful for detailed scanning reports.
     */
    fun getAllEntries(): List<FakeGpsAppEntry> = knownFakeGpsApps

    /**
     * Get the display name of a known fake GPS app, or null if not found.
     */
    fun getDisplayName(packageName: String): String? {
        return knownFakeGpsApps.find {
            it.packageName.equals(packageName, ignoreCase = true)
        }?.displayName
    }

    /**
     * Perform fuzzy matching against known package name patterns.
     * Catches repackaged/renamed variants of known fake GPS apps.
     *
     * Patterns checked:
     *   - Contains "fakegps" or "fake.gps" or "fake_gps"
     *   - Contains "mockgps" or "mock.gps" or "mock_gps"
     *   - Contains "mocklocation" or "mock.location"
     *   - Contains "gps.joystick" or "gpsjoystick"
     *   - Contains "gpsspoof" or "gps.spoof"
     *   - Contains "locationfaker" or "location.faker"
     *
     * @return true if the package name matches any suspicious pattern
     *         and is NOT whitelisted.
     */
    fun matchesSuspiciousPattern(packageName: String): Boolean {
        if (isWhitelisted(packageName)) return false

        val normalized = packageName.lowercase().replace("[._-]".toRegex(), "")
        val suspiciousPatterns = listOf(
            "fakegps",
            "gpsfake",
            "mockgps",
            "gpsmock",
            "mocklocation",
            "locationmock",
            "gpsjoystick",
            "joystickgps",
            "gpsspoof",
            "spoofgps",
            "locationfaker",
            "fakerlocation",
            "gpschanger",
            "changergps",
            "gpssetter",
            "settergps",
            "gpsemulator",
            "emulatorgps",
            "virtuallocation",
            "locationvirtual",
        )

        return suspiciousPatterns.any { pattern -> normalized.contains(pattern) }
    }
}
