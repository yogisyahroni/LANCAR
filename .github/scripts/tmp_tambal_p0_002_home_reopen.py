from pathlib import Path

dashboard = Path("android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt")
source = dashboard.read_text(encoding="utf-8")

source = source.replace(
'''    onTrackingClick: (String) -> Unit = {},
    onChatClick: (String) -> Unit = {},''',
'''    onTrackingClick: (String) -> Unit = {},
    onRoadsideTrackingClick: (String, String) -> Unit = { _, _ -> },
    onChatClick: (String) -> Unit = {},''',
1
)

source = source.replace(
'''    val incomingPackages by viewModel.incomingPackages.collectAsState()
    val dataError by viewModel.dataError.collectAsState()''',
'''    val incomingPackages by viewModel.incomingPackages.collectAsState()
    val activeOrders by viewModel.activeOrders.collectAsState()
    val activeRoadsideOrders = activeOrders.filter { it.hasCanonicalRoadsideSubtype() }
    val dataError by viewModel.dataError.collectAsState()''',
1
)

source = source.replace(
'''                    item {
                        GojekServiceGrid(
                            onPickupClick = { onBookingClick("pickup") }, // Gabung ambil/kirim
                            onFoodClick = onFoodClick,
                            onAggregatorClick = { onBookingClick("aggregator") },
                            onTambalBanClick = { onBookingClick("tambal_ban") },
                            onTowingClick = { onBookingClick("towing") }
                        )
                    }

                // A4:''',
'''                    item {
                        GojekServiceGrid(
                            onPickupClick = { onBookingClick("pickup") }, // Gabung ambil/kirim
                            onFoodClick = onFoodClick,
                            onAggregatorClick = { onBookingClick("aggregator") },
                            onTambalBanClick = { onBookingClick("tambal_ban") },
                            onTowingClick = { onBookingClick("towing") }
                        )
                    }

                    if (activeRoadsideOrders.isNotEmpty()) {
                        item {
                            ActiveRoadsideOrdersSection(
                                orders = activeRoadsideOrders,
                                onTrackingClick = { order ->
                                    val serviceSubType = requireNotNull(order.serviceSubType)
                                    onRoadsideTrackingClick(order.orderId, serviceSubType)
                                }
                            )
                        }
                    }

                // A4:''',
1
)

helper_anchor = '''@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun SharedTransitionScope.CustomerNavigation('''
helper = r'''
private val canonicalRoadsideSubTypes = setOf(
    "tambal_ban_motor",
    "tambal_ban_mobil",
    "towing_motor",
    "towing_mobil"
)

private fun Order.hasCanonicalRoadsideSubtype(): Boolean =
    serviceSubType in canonicalRoadsideSubTypes &&
        serviceCategory in setOf("tambal_ban", "towing")

@Composable
private fun ActiveRoadsideOrdersSection(
    orders: List<Order>,
    onTrackingClick: (Order) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        DashboardSectionHeader(
            title = "Layanan aktif",
            subtitle = "Lanjut pantau petugas roadside kamu"
        )
        orders.forEach { order ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onTrackingClick(order) },
                shape = RoundedCornerShape(TembusRadius.Card),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val isTowing = order.serviceCategory == "towing"
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(TembusRadius.Card))
                            .background(if (isTowing) SoftBlue else SoftOrange),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isTowing) Icons.Default.DirectionsCar else Icons.Default.Build,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = if (isTowing) "Towing aktif" else "Tambal ban aktif",
                            fontWeight = FontWeight.Bold,
                            color = Ink
                        )
                        Text(
                            text = humanOrderStatus(order.status.lowercase()),
                            color = Muted,
                            fontSize = 12.sp
                        )
                        val eta = order.etaMinutes
                        if (eta != null && eta > 0) {
                            Text(
                                text = "ETA $eta menit",
                                color = Muted,
                                fontSize = 12.sp
                            )
                        }
                    }
                    TextButton(onClick = { onTrackingClick(order) }) {
                        Text("Pantau")
                    }
                }
            }
        }
    }
}

'''
if "private fun Order.hasCanonicalRoadsideSubtype()" not in source:
    if helper_anchor not in source:
        raise SystemExit("Dashboard helper anchor missing")
    source = source.replace(helper_anchor, helper + helper_anchor, 1)

dashboard.write_text(source, encoding="utf-8")

nav = Path("android-app-customer/app/src/main/java/com/tembus/customer/ui/navigation/RootNavGraph.kt")
nav_source = nav.read_text(encoding="utf-8")
nav_source = nav_source.replace(
'''                    onTrackingClick = { orderId -> navController.navigate(Screen.Tracking.createRoute(orderId)) },
                    onChatClick = { orderId -> navController.navigate(Screen.Chat.createRoute(orderId, null)) },''',
'''                    onTrackingClick = { orderId -> navController.navigate(Screen.Tracking.createRoute(orderId)) },
                    onRoadsideTrackingClick = { orderId, serviceSubType ->
                        navController.navigate(Screen.ServiceTracking.createRoute(orderId, serviceSubType))
                    },
                    onChatClick = { orderId -> navController.navigate(Screen.Chat.createRoute(orderId, null)) },''',
1
)
nav.write_text(nav_source, encoding="utf-8")

test = Path("android-app-customer/app/src/test/java/com/tembus/customer/ui/screens/service/ServiceRouteContractTest.kt")
test_source = test.read_text(encoding="utf-8")
if "dashboardReopensActiveRoadsideOrderWithDedicatedTrackingRoute" not in test_source:
    test_source = test_source.rsplit("\n}", 1)[0] + r'''

    @Test
    fun dashboardReopensActiveRoadsideOrderWithDedicatedTrackingRoute() {
        val dashboardSource = File(
            "app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt"
        ).readText()
        val navSource = File(
            "app/src/main/java/com/tembus/customer/ui/navigation/RootNavGraph.kt"
        ).readText()

        assertTrue(dashboardSource.contains("viewModel.activeOrders.collectAsState()"))
        assertTrue(dashboardSource.contains("ActiveRoadsideOrdersSection("))
        assertTrue(dashboardSource.contains("onRoadsideTrackingClick(order.orderId, serviceSubType)"))
        assertTrue(navSource.contains("onRoadsideTrackingClick = { orderId, serviceSubType ->"))
        assertTrue(navSource.contains("Screen.ServiceTracking.createRoute(orderId, serviceSubType)"))
    }
}
'''
test.write_text(test_source, encoding="utf-8")
