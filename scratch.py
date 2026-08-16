import re

file_path = r'E:\antigraviti google\SUDAH DEPLOY\LANCAR\android-app-customer\app\src\main\java\com\tembus\customer\ui\screens\main\DashboardScreen.kt'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add new imports
new_imports = '''import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreHoriz'''
content = content.replace('import androidx.compose.material.icons.filled.Store', 'import androidx.compose.material.icons.filled.Store\n' + new_imports)

# 2. Replace Scaffold content
scaffold_old = '''        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { isRefreshing = true },
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 30.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                item {
                    HomeTopBar(
                        customerName = customerName.orEmpty().ifBlank { "Pelanggan" },
                        notificationUnreadCount = notificationUnreadCount,
                        onNotificationsClick = onNotificationsClick
                    )
                }

                // Featured TEMBUS services — main entry points
                item {
                    FeaturedServices(
                        onPickupClick = { onBookingClick("pickup") },
                        onDropoffClick = { onBookingClick("dropoff") }
                    )
                }

                // Service grid (2 columns): active + coming soon
                item {
                    ServiceGrid(
                        incomingCount = incomingPackages.size,
                        hasUnreadMessages = hasUnreadMessages,
                        onPickupClick = { onBookingClick("pickup") },
                        onDropoffClick = { onBookingClick("dropoff") },
                        onFoodClick = onFoodClick,
                        onIncomingClick = onIncomingClick,
                        onHistoryClick = onHistoryClick
                    )
                }'''

scaffold_new = '''        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { isRefreshing = true },
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // Background hijau ala Gojek di bagian atas
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .background(LcGreen)
                )
                
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 30.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    item {
                        GojekTopBar(
                            customerName = customerName.orEmpty().ifBlank { "Pelanggan" },
                            notificationUnreadCount = notificationUnreadCount,
                            onNotificationsClick = onNotificationsClick,
                            onProfileClick = onProfileClick
                        )
                    }

                    item {
                        WalletCard()
                    }

                    item {
                        GojekServiceGrid(
                            incomingCount = incomingPackages.size,
                            onPickupClick = { onBookingClick("pickup") }, // Gabung ambil/kirim
                            onFoodClick = onFoodClick,
                            onIncomingClick = onIncomingClick,
                            onHistoryClick = onHistoryClick
                        )
                    }'''

content = content.replace(scaffold_old, scaffold_new)

# 3. Replace the components (HomeTopBar to end of ServiceTile)
components_pattern = r'@Composable\nprivate fun HomeTopBar.*?@Composable\nprivate fun DashboardDataErrorCard'

gojek_components = '''@Composable
private fun GojekTopBar(
    customerName: String,
    notificationUnreadCount: Int,
    onNotificationsClick: () -> Unit,
    onProfileClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            modifier = Modifier.weight(1f).height(42.dp),
            shape = RoundedCornerShape(21.dp),
            color = Color.White
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 16.dp)
            ) {
                Icon(Icons.Default.Search, contentDescription = "Search", tint = Muted, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Cari layanan, makanan...", color = Muted, fontSize = 14.sp)
            }
        }
        Spacer(Modifier.width(12.dp))
        Box(contentAlignment = Alignment.TopEnd) {
            IconButton(
                onClick = onNotificationsClick,
                modifier = Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f))
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = "Notifikasi", tint = Color.White)
            }
            if (notificationUnreadCount > 0) {
                Box(
                    modifier = Modifier.size(18.dp).clip(CircleShape).background(Accent),
                    contentAlignment = Alignment.Center
                ) {
                    Text(notificationUnreadCount.coerceAtMost(99).toString(), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Spacer(Modifier.width(8.dp))
        IconButton(
            onClick = onProfileClick,
            modifier = Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f))
        ) {
            Icon(Icons.Default.Person, contentDescription = "Profil", tint = Color.White)
        }
    }
}

@Composable
private fun WalletCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(SoftBlue),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = LcGreen)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Rp50.000", fontWeight = FontWeight.Black, fontSize = 16.sp, color = Ink)
                Text("183 coins", color = Muted, fontSize = 12.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                WalletAction(Icons.Default.ArrowUpward, "Bayar")
                WalletAction(Icons.Default.Add, "Top Up")
                WalletAction(Icons.Default.MoreHoriz, "Lainnya")
            }
        }
    }
}

@Composable
private fun WalletAction(icon: ImageVector, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(LcGreen),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Ink)
    }
}

@Composable
private fun GojekServiceGrid(
    incomingCount: Int,
    onPickupClick: () -> Unit,
    onFoodClick: () -> Unit,
    onIncomingClick: () -> Unit,
    onHistoryClick: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            GojekServiceTile("Kirim Paket", Icons.Default.LocalShipping, SoftGreen, onPickupClick)
            GojekServiceTile("Food", Icons.Default.Restaurant, SoftOrange, onFoodClick)
            GojekServiceTile("Tambal Ban", Icons.Default.Build, MaterialTheme.colorScheme.surfaceVariant, {})
            GojekServiceTile("Towing", Icons.Default.DirectionsCar, MaterialTheme.colorScheme.surfaceVariant, {})
        }
        Spacer(Modifier.height(20.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            GojekServiceTile("Paket Masuk", Icons.Default.Store, MaterialTheme.colorScheme.surfaceVariant, onIncomingClick, badge = if (incomingCount > 0) incomingCount.toString() else null)
            GojekServiceTile("Riwayat", Icons.Default.History, MaterialTheme.colorScheme.surfaceVariant, onHistoryClick)
            GojekServiceTile("Promo", Icons.Default.CheckCircle, SoftBlue, {})
            GojekServiceTile("Lainnya", Icons.Default.MoreHoriz, MaterialTheme.colorScheme.surfaceVariant, {})
        }
    }
}

@Composable
private fun GojekServiceTile(
    label: String,
    icon: ImageVector,
    color: Color,
    onClick: () -> Unit,
    badge: String? = null
) {
    Column(
        modifier = Modifier.width(68.dp).clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(color),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = label, tint = LcGreen, modifier = Modifier.size(30.dp))
            }
            if (badge != null) {
                Box(
                    modifier = Modifier.align(Alignment.TopEnd).size(20.dp).clip(CircleShape).background(Accent),
                    contentAlignment = Alignment.Center
                ) {
                    Text(badge, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = Ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun DashboardDataErrorCard'''

content = re.sub(components_pattern, gojek_components, content, flags=re.DOTALL)

# Add closing bracket for the Box wrapping LazyColumn
content = content.replace('            }\n        }\n    }\n}\n\n@Composable\nprivate fun tembusNavigationColors()', '            }\n            }\n        }\n    }\n}\n\n@Composable\nprivate fun tembusNavigationColors()')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
