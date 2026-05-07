# DESIGN SYSTEM & ARCHITECTURE SPECIFICATION: MOBILE COURIER APPLICATION
## LANCAR Hyperlocal Relay Platform (v1.1)

---

> **CLASSIFICATION:** TOP SECRET / HIGH-FIDELITY ARCHITECTURE  
> **OPERATIONAL SCHEMA:** OFFLINE-FIRST / SECURITY GRADE S++  
> **TARGET COMPATIBILITY:** Native Android (Kotlin / SDK 26+ / Android 8.0+) - Jetpack Compose Priority

---

## 1. STRATEGIC CONTEXT & MOBILE CHECKPOINT

### 1.1 Intent Decoding & Core Objectives
The **LANCAR Mobile Courier Application** is a specialized native Android mobile interface designed for hyperlocal relay courier partners. Since couriers operate in demanding environments—often while driving, under bright sunlight, with weak network signals, and using a single hand—the design and execution must prioritize **extreme readability, tactile feedback, low friction, and ironclad resilience**. 

This system maps directly to the active **LANCAR API Gateway** microservices (`auth-service`, `order-service`, `routing-service`, `pricing-engine`, `tracking-service`, `payment-service`, `media-service`).

### 1.2 Mobile Feasibility & Risk Index (MFRI)
Evaluating the feasibility of implementing the Mobile Courier App features on Android Native:

| Dimension | Risk Rating (1-5) | Rationale & Mitigations |
|---|---|---|
| **Platform Clarity** | 5 (Very Clear) | Explicitly targeted at Native Android (Kotlin + Jetpack Compose) for maximum performance and deep OS integration. |
| **Interaction Complexity** | 3 (Moderate) | Involves complex flows such as AR Volumetric camera measurements, live GPS relay synchronizations, and dual QR/Video handovers. |
| **Performance Risk** | 1 (Very Low) | Managed via Jetpack Compose lazy layouts (`LazyColumn`), sub-millisecond drawing passes, and native thread scheduling via Kotlin Coroutines. |
| **Offline Dependence** | 4 (High Risk) | Couriers constantly drift into dead-zones. Addressed using **Room Database with SQLCipher** for offline-first replication and WorkManager for background task sync. |
| **Accessibility Risk** | 2 (Low Risk) | Solved by strictly enforcing Material 3 touch targets (≥ 48dp), high-contrast AA typography, and single-hand optimized Compose layouts. |

$$MFRI = (\text{Platform Clarity} + \text{Accessibility Readiness}) - (\text{Interaction Complexity} + \text{Performance Risk} + \text{Offline Dependence})$$
$$MFRI = (5 + 5) - (3 + 1 + 4) = 10 - 8 = +2 \implies \text{Highly Optimized Native Architecture & Room Sync Strategy Mandatory}$$

### 1.3 Mobile Checkpoint Integration
```
🧠 MOBILE CHECKPOINT

Platform:     Native Android 8.0+ (API 26+)
Framework:    Kotlin, Jetpack Compose, Room DB, Retrofit & Coroutines
Files Read:   PRD_FINAL_v1.1.md, globals.css (Frontend Next.js App)

3 Principles Applied:
1. Touch-First Layouts: Key CTA buttons must sit within the lower thumb-zone (min 48dp).
2. Battery- & Network-Conscious Polling: Throttle location streams using FusedLocationProviderClient + Kalman filters and buffer offline events.
3. Perfect Visual Continuity: Carry over Green Lancar, glassmorphism, and smooth transitions from the web portal.

Anti-Patterns Avoided:
1. Infinite Lists Memory Leaks: Banned Column with verticalScroll for large dynamic arrays. Use LazyColumn.
2. Hardcoded Secrets & Local Storage Vulnerabilities: Avoid standard SharedPreferences. Force Android Keystore encrypted enclaves.
```

---

## 2. BRAND IDENTITY & DESIGN SYSTEM (WEB-ALIGNED)

The mobile application carries over the core aesthetic tokens of the **LANCAR Web Portal** to establish absolute visual consistency. It uses a sleek dark mode by default for battery savings (OLED) and reduced glare under high sunlight.

### 2.1 Color Palette & Token Sync

```
  Primary Lancar Green          Primary Light (Accent)        Primary Dark
  [    #006437    ]             [    #22C55E    ]             [    #004D2A    ]
  
  Dark Background               Light Background              Glass Border
  [    #09090b    ]             [    #fafafa    ]             [  white/10 (Dark) ]
```

| Token | Hex Value | Semantic Purpose |
|---|---|---|
| `--color-primary` | `#006437` | Core branding, primary actions, and headers. |
| `--color-primary-light` | `#22C55E` | Accent colors, successes, online status indicators, and active legs. |
| `--color-primary-dark` | `#004D2A` | Pressed button states and focused containers. |
| `--color-background-dark` | `#09090B` | Default dark theme background (zinc-950) for battery longevity. |
| `--color-background-light`| `#FAFAFA` | Light theme fallback (zinc-50) for indoor usage. |
| `--color-foreground-dark` | `#F4F4F5` | Primary body text in dark mode (zinc-100). |
| `--color-foreground-light`| `#18181B` | Primary body text in light mode (zinc-900). |
| `--color-border-translucent`| `rgba(255,255,255,0.1)` | Subtle glassmorphism borders for cards and containers. |

### 2.2 Typography Hierarchy (Inter Font Stack)
We implement the `Inter` font stack with tight tracking and explicit visual hierarchy in Jetpack Compose `Typography`:

- **Screen Titles:** `Inter-Bold`, size `24.sp`, tracking `-0.025.em` (for clear screen identifier).
- **Subheaders / Card Titles:** `Inter-SemiBold`, size `16.sp`, tracking `-0.015.em`.
- **Primary Body Text:** `Inter-Medium`, size `14.sp`, tracking `0.0.em`.
- **Secondary / Metadata:** `Inter-Regular`, size `12.sp`, color `Zinc-400` / `Muted`.

### 2.3 Glassmorphic Depth & Jetpack Compose Implementation
To match the web's `.glass-card` and `.glass-button` stylings, the Android app utilizes standard Compose shape styling with alpha blending and translucent borders:

```kotlin
// Concrete Jetpack Compose Glassmorphism Card Blueprint
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun LancarGlassCard(
    modifier: Modifier = Modifier,
    borderRadius: Dp = 16.dp,
    padding: PaddingValues = PaddingValues(16.dp),
    content: @Composable BoxScope.() -> Unit
) {
    val isDark = isSystemInDarkTheme()
    Box(
        modifier = modifier
            .shadow(
                elevation = 8.dp,
                shape = RoundedCornerShape(borderRadius),
                clip = false,
                ambientColor = Color.Black.copy(alpha = 0.05f),
                spotColor = Color.Black.copy(alpha = 0.1f)
            )
            .clip(RoundedCornerShape(borderRadius))
            .background(
                color = if (isDark) Color(0x0DFFFFFF) else Color(0x99FFFFFF)
            )
            .border(
                width = 1.dp,
                color = if (isDark) Color(0x1AFFFFFF) else Color(0x1A000000),
                shape = RoundedCornerShape(borderRadius)
            )
            .padding(padding),
        content = content
    )
}
```

### 2.4 Micro-Interactions & Tactile Feedback Loops
A static UI is considered a bug. Every interactive element must invoke immediate tactile feedback:

1. **Active Press Scaling:** Interactive buttons scale down smoothly to `0.95f` on contact and bounce back.
2. **Haptic Responses:** 
   - Light Tap (`HapticFeedbackType.TextHandleMove`) on normal button presses.
   - Heavy Tap (`HapticFeedbackType.LongPress`) on critical actions (e.g., confirming delivery or starting handover).
3. **Motion Curves:** Use `FastOutSlowInEasing` for screen transitions and drawer movements to feel organic and fluid.

```kotlin
// Concrete Jetpack Compose Tactile Press-Scaling Button Blueprint
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material.ripple.rememberRipple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp

@Composable
fun LancarTactileButton(
    onPressed: () -> Unit,
    modifier: Modifier = Modifier,
    backgroundColor: Color = Color(0xFF006437), // Primary Lancar Green
    content: @Composable RowScope.() -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val haptic = LocalHapticFeedback.current
    
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.95f else 1.0f,
        animationSpec = tween(durationMillis = 100, easing = FastOutSlowInEasing),
        label = "ButtonScaleAnimation"
    )

    LaunchedEffect(isPressed) {
        if (isPressed) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }

    Box(
        modifier = modifier
            .scale(scale)
            .clip(RoundedCornerShape(12.dp))
            .background(backgroundColor)
            .clickable(
                interactionSource = interactionSource,
                indication = rememberRipple(bounded = true, color = Color.White),
                onClick = onPressed
            )
            .padding(vertical = 16.dp, horizontal = 24.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            content = content
        )
    }
}
```

### 2.5 Loading Psychology (Shimmer Skeletons)
Generic spinning loader widgets irritate users and increase perceived latency. The Lancar Courier app utilizes **Shimmer Skeletons** mimicking the exact layout of incoming cards.

```kotlin
// Concrete Shimmer Loader Component using Jetpack Compose Brush Shimmer
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.layout.size
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush

@Composable
fun LancarShimmerSkeleton(
    width: Dp,
    height: Dp,
    borderRadius: Dp = 8.dp,
    modifier: Modifier = Modifier
) {
    val isDark = isSystemInDarkTheme()
    val baseColor = if (isDark) Color(0xFF1E1E1E) else Color(0xFFE0E0E0)
    val highlightColor = if (isDark) Color(0xFF2D2D2D) else Color(0xFFF5F5F5)

    val transition = rememberInfiniteTransition(label = "ShimmerTransition")
    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "ShimmerTranslation"
    )

    val shimmerBrush = Brush.linearGradient(
        colors = listOf(baseColor, highlightColor, baseColor),
        start = Offset.Zero,
        end = Offset(x = translateAnim, y = translateAnim)
    )

    Box(
        modifier = modifier
            .size(width = width, height = height)
            .clip(RoundedCornerShape(borderRadius))
            .background(shimmerBrush)
    )
}
```

---

## 3. CORE ARCHITECTURAL & OFFLINE-FIRST DESIGNS

### 3.1 Offline-First Sync Architecture (Room + WorkManager)
Couriers lose signal under tunnels, inside elevators, or in rural areas. High-performance offline architecture is enforced:

```
                  ┌─────────────────────────────────────┐
                  │         LANCAR Android App          │
                  │   ┌───────────────┐                 │
                  │   │  Compose VM   │                 │
                  │   └───────▲───────┘                 │
                  │           │                         │
                  │   ┌───────▼───────┐  Sync Queue     │
                  │   │ Room SQLite DB│ ─────────────┐  │
                  │   └───────────────┘              │  │
                  └──────────────────────────────────┼──┘
                                                     │
                                            [Network Available?]
                                                     │
                                            ┌────────┴────────┐
                                            │                 │
                                           [YES]             [NO]
                                             │                 │
                                     ┌───────▼───────┐ ┌───────▼───────┐
                                     │ API Gateway   │ │ Room Local    │
                                     │ (Postgres)    │ │ WorkManager   │
                                     └───────────────┘ └───────────────┘
```

1. **Local Storage:** Use **Room Database with SQLCipher Encryption** (Robust SQLite wrapper with database-level encryption). All assigned orders, profile data, and pricing structures are replicated locally.
2. **Pending Transactions Queue:** Any mutate request (GPS coordinates, Scan confirmations, Handover states) is written into a Room `PendingSync` entity table first.
3. **Connectivity Watchdog (WorkManager):** An Android `CoroutineWorker` monitors system connectivity constraints. Once the connection is re-established, the pending queue is processed sequentially using an idempotent retry strategy via WorkManager constraints.

---

## 4. DETAILED FEATURE FLOW & GRAPHICS

### 4.1 Onboarding & Identity Verification
To register and start accepting high-value hyperlocal deliveries, the courier must complete a multi-step verification process:

```
  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
  │ OTP WhatsApp │ ───> │ Identity Doc │ ───> │   Liveness   │ ───> │ Onboarding   │
  │ / SMS Login  │      │ Photo (KTP)  │      │ Selfie Scan  │      │ Training     │
  └──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
```

1. **OTP Login:** Input Phone Number $\implies$ receive 6-digit OTP via WhatsApp (primary) or SMS. Verify JWT.
2. **Identity Verification:** Captured via Android CameraX library, compressing the image locally before transmission. Required documents:
   - Photo of KTP (Indonesian National Identity Card).
   - Photo of driver's license (SIM C).
   - Photo of motorcycle registration document (STNK) matching vehicle plate.
3. **Liveness Check:** Front camera scan using native FaceDetector APIs, requiring active gestures (blink, smile) to prevent spoofing using static photographs.
4. **Onboarding Training:** Interactive swiper presenting delivery guidelines, QR scanning rules, and SLA structures, followed by a mandatory 3-question quiz (must achieve 100% score).

---

### 4.2 Online/Offline Dispatch Dashboard
A clean, centralized interface displaying the courier's active state:

```
┌────────────────────────────────────────────────────────┐
│  [🟢 ONLINE]                                  SOS [🚨] │
│                                                        │
│  ZONA AKTIF: Jakarta Selatan (Sudirman-Blok M)         │
│  ACCEPTANCE RATE: 89%   │   RELAY SCORE: 4.8 / 5.0     │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │                 TERIMA ORDER BARU                │  │
│  │  ==============================================  │  │
│  │  📦 MODEL: 2-Kaki (Relay Hub Sudirman)           │  │
│  │  🛣️ ESTIMASI FEED: Rp 22.500                     │  │
│  │  ⏱️ TERIMA DALAM: 24 Detik                        │  │
│  │                                                  │  │
│  │  [   DECLINE   ]          [    ACCEPT (TAP)   ]  │  │
│  │  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

- **Online Switcher:** Background location begins tracking every 10 seconds via FusedLocationProviderClient.
- **Order Feed Screen:** Incoming matches show up as a fullscreen card with a high-contrast countdown timer of **30 seconds** (auto-declines if missed).
- **Reject Count Protection:** Couriers are capped at **3 declines per hour** to prevent strategic gamification. Exceeding triggers a 15-minute cool-down warning.

---

### 4.3 AR Volumetric Scanning & Fallback
If the package dimensions are not pre-measured by the customer, the courier is prompted to calculate the volumetric weight upon pickup:

$$\text{Berat Volumeterik (kg)} = \frac{\text{Panjang (cm)} \times \text{Lebar (cm)} \times \text{Tinggi (cm)}}{5000}$$

```kotlin
// Volumetric Scanner Compose Component
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight

@Composable
fun LancarVolumetricScannerView(
    onManualInputClick: () -> Unit,
    onCaptureClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        // Simulated Camera Preview via AndroidView (CameraX PreviewView)
        // Draw custom guiding grid overlay on top
        Canvas(modifier = Modifier.fillMaxSize()) {
            val gridSpacing = 40.dp.toPx()
            val gridColor = Color.White.copy(alpha = 0.15f)
            
            for (x in 0..size.width.toInt() step gridSpacing.toInt()) {
                drawLine(
                    color = gridColor,
                    start = Offset(x.toFloat(), 0f),
                    end = Offset(x.toFloat(), size.height),
                    strokeWidth = 1f
                )
            }
            for (y in 0..size.height.toInt() step gridSpacing.toInt()) {
                drawLine(
                    color = gridColor,
                    start = Offset(0f, y.toFloat()),
                    end = Offset(size.width, y.toFloat()),
                    strokeWidth = 1f
                )
            }
        }
        
        // Centered Measurement Target box
        Box(
            modifier = Modifier
                .size(250.dp)
                .align(Alignment.Center)
                .border(2.dp, Color(0xFF22C55E), RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Arahkan Kamera ke Paket",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }
        
        // Back & Manual Input Trigger Button Fallback
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .padding(bottom = 40.dp, start = 20.dp, end = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            LancarTactileButton(
                onPressed = onManualInputClick,
                modifier = Modifier.weight(1f),
                backgroundColor = Color(0xFF2D2D2D)
            ) {
                Text(text = "Input Manual", color = Color.White)
            }
            LancarTactileButton(
                onPressed = onCaptureClick,
                modifier = Modifier.weight(1f),
                backgroundColor = Color(0xFF006437)
            ) {
                Text(text = "Ambil Gambar", color = Color.White)
            }
        }
    }
}
```

- **A/B Dual-Mode Lens:** The app checks device capabilities.
  - **High-End (LiDAR / ARCore):** Uses native ARCore depth API $\implies$ precision of $\pm 1$cm.
  - **Low-End Fallback:** Captures a single image with a reference standard (e.g., standard KTP card laid beside the box) and processes it on the Python `scanning-service`.

---

### 4.4 Handover Relay Flow (2-Kaki & 3-Kaki Relay)
The physical transfer of custody is highly documented to eliminate package leakage, theft, and disputes:

```
  ┌─────────────────────────────────────────────────────────────┐
  │                   RELAY HANDOVER SEQUENCE                   │
  │                                                             │
  │  1. GPS Sync: Both Courier A and B directed to Meeting Point│
  │  2. QR Exchange: Courier B scans Courier A's Package QR     │
  │  3. Video Evidence: Capture 3-5 seconds video of the box    │
  │  4. Condition Check: Confirm condition (OK or Damaged)      │
  │  5. Signature: Direct digital signature on screen           │
  └─────────────────────────────────────────────────────────────┘
```

- **Titik Temu Matching:** Algorithm routes both couriers to the designated meeting point. A live ETA is calculated using Google Maps Android SDK.
- **Double-Lock QR Handover:** Courier A shows the unique dynamic QR code displayed on their screen. Courier B scans it using their camera (ML Kit Barcode Scanning).
- **Video Evidence Capture:** Courier A must hold their camera up and record a **3-5 second clip** of the box being passed to Courier B. The clip is parsed locally, compressed, and synchronized to S3 storage via the `media-service`.

---

## 5. SECURITY GRADE S++ HARDENING

To operate within an enterprise-grade ecosystem, the Mobile Courier app implements maximum security patterns (Zero Trust Architecture):

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   LANCAR MOBILE HARDENING ARTIFACTS                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [🛡️ RASP ENGINE] ──> RootBeer check ──> Terminate Active Session         │
│                                                                          │
│  [🗺️ LOCATION]    ──> Kalman Speed Filters ──> Catch GPS Spoofers         │
│                                                                          │
│  [🔒 STORAGE]     ──> EncryptedSharedPreferences ──> Shield Auth JWTs    │
│                                                                          │
│  [🌐 NETWORK]     ──> CertificatePinner Pinning ──> Stop MITM Attacks    │
│                                                                          │
│  [🖼️ INTERFACE]   ──> FLAG_SECURE Enabled     ──> Stop Screen Snipping   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Root Defense (RASP Engine)
- Employs **RootBeer** library to check for administrative binaries (e.g., `su` binary, test-keys, busybox-app, supersu paths, magisk environment).
- **Graceful Security Degradation:** If root is detected, the app automatically deletes the local encrypted Room database, wipes the auth JWT token from Keystore, and flags the courier's profile status as `suspended` in the backend.

### 5.2 GPS Anti-Spoofing & Spoof Detection
- Couriers often use virtual GPS apps (mock locations) to receive orders from lucrative zones while resting.
- **Mock Location Filtering:** Checks `location.isFromMockProvider` on modern SDKs, blocking execution if true.
- **Kalman Filtering:** All incoming coordinates pass through a local velocity filter:

$$\text{Velocity} = \frac{\Delta \text{Distance}}{\Delta \text{Time}}$$

- If the computed speed exceeds $120$ km/h between two intervals within an urban area, a GPS spoofing alert is logged, and the order flow is frozen.

### 5.3 Biometric Keystore & Token Encryption
- Sensitive tokens are **never** stored in plain text or standard SharedPreferences.
- Every API request is verified with short-lived JWTs (15 min expiration) stored within the native **Android Keystore** encrypted enclave (via `EncryptedSharedPreferences`), accessible only after successful biometric (Fingerprint / Face ID via `BiometricPrompt`) verification.

### 5.4 Secure SSL Pinning
- Rejects any server communication that does not present the exact SHA-256 fingerprint matching the LANCAR API Gateway certificate. Implemented directly in the OkHttpClient configuration:

```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add("api.lancar.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    .build()

val okHttpClient = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

This completely blocks Man-In-The-Middle (MITM) attacks on public Wi-Fi stations.

### 5.5 Interface Screenshot Shielding
- For sensitive screens (such as OTP inputs, QRIS payment pages, and payout history), the app activates native secure flags in the corresponding Activity `onCreate`:

```kotlin
activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
```

This blocks screenshot capture, native screen recording, and blacks out the app thumbnail in the Recents overview.

---

## 6. ENDPOINT MAPPING & API SERVICE ARCHITECTURE

The application interfaces with the **LANCAR API Gateway** routing to backend microservices.

### 6.1 Authentication API (`auth-service` via Port 8080)
- **Send OTP Code:** 
  - `POST /api/v1/auth/otp/send`
  - Body: `{"phone_number": "08123456789", "channel": "whatsapp"}`
- **Verify OTP Code:**
  - `POST /api/v1/auth/otp/verify`
  - Body: `{"phone_number": "08123456789", "code": "123456"}`
  - Response: `{"status": "success", "token": "JWT_BEARER_TOKEN", "refresh_token": "JWT_REFRESH_TOKEN"}`
- **Register Account:**
  - `POST /api/v1/auth/register`
  - Body: `{"phone_number": "08123456789", "full_name": "Yogi", "vehicle_plate": "B 1234 CDG"}`

### 6.2 Order Lifecycle API (`order-service` via Port 8080)
- **Get Active Relay Feed:**
  - `GET /api/v1/couriers/feed?zone_id=12`
  - Headers: `Authorization: Bearer JWT_TOKEN`
- **Accept Order:**
  - `POST /api/v1/couriers/orders/{order_id}/accept`
- **Confirm Arrival at Pickup:**
  - `POST /api/v1/couriers/orders/{order_id}/arrive`
  - Body: `{"latitude": -6.214, "longitude": 106.845, "photo_url": "https://s3.lancar.com/pickups/img.jpg"}`

### 6.3 Routing & Tracking API (`routing-service` & `tracking-service` via Port 8080)
- **Send GPS Coordinates (10-second interval):**
  - `POST /api/v1/routing/track`
  - Body: `{"order_id": "abc-123", "courier_id": "cour-999", "latitude": -6.214, "longitude": 106.845, "timestamp": "2026-05-06T19:00:00Z"}`
- **Match Handover Meeting Point:**
  - `GET /api/v1/routing/meeting-point?order_id=abc-123`
  - Response: `{"latitude": -6.222, "longitude": 106.832, "name": "Hub Sudirman", "buffer_radius": 150.0}`

### 6.4 Wallet & Financial API (`payment-service` via Port 8080)
- **Fetch Earnings Dashboard:**
  - `GET /api/v1/wallet/balance`
  - Response: `{"current_balance": 450000.0, "today_earnings": 125000.0, "relay_score": 4.8}`
- **Trigger Payout:**
  - `POST /api/v1/wallet/payout`
  - Body: `{"amount": 400000.0, "bank_code": "bca", "account_number": "123456789"}`

---

## 7. JETPACK COMPOSE COMPONENT BLUEPRINTS

To demonstrate the full execution capabilities and UI layouts, we define high-performance, beautiful Compose UI components utilizing the designated Lancar brand tokens.

### 7.1 Courier Dashboard Screen Core Composable
```kotlin
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.Icon
import androidx.compose.material.IconButton
import androidx.compose.material.Scaffold
import androidx.compose.material.Switch
import androidx.compose.material.SwitchDefaults
import androidx.compose.material.Text
import androidx.compose.material.TopAppBar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsBike
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun LancarCourierDashboard(
    modifier: Modifier = Modifier
) {
    var isOnline by remember { mutableStateOf(false) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        backgroundColor = Color(0xFF09090B), // Zinc-950 Dark Mode Background
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "LANCAR Mitra",
                        fontFamily = FontFamily.SansSerif,
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        color = Color.White
                    )
                },
                backgroundColor = Color.Transparent,
                elevation = 0.dp,
                actions = {
                    IconButton(onClick = { /* Trigger instant emergency SOS alert */ }) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = "PanicSOS",
                            tint = Color(0xFFEF4444)
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Status Toggle Glass Card
            item {
                LancarGlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = if (isOnline) "Online & Siap Terima Order" else "Status Anda Offline",
                                color = Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = if (isOnline) "Mencari pengiriman terbaik..." else "Aktifkan untuk mulai bekerja",
                                color = Color.Gray,
                                fontSize = 12.sp
                            )
                        }
                        Switch(
                            checked = isOnline,
                            onCheckedChange = { isOnline = it },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color(0xFF22C55E),
                                checkedTrackColor = Color(0xFF22C55E).copy(alpha = 0.5f)
                            )
                        )
                    }
                }
            }

            // Performance Metrics Cards Row
            item {
                Column {
                    Text(
                        text = "Performa Hari Ini",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        LancarGlassCard(modifier = Modifier.weight(1f)) {
                            Column(horizontalAlignment = Alignment.Start) {
                                Text(text = "Pendapatan", color = Color.Gray, fontSize = 12.sp)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Rp 125.000",
                                    color = Color.White,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                        LancarGlassCard(modifier = Modifier.weight(1f)) {
                            Column(horizontalAlignment = Alignment.Start) {
                                Text(text = "Relay Score", color = Color.Gray, fontSize = 12.sp)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "4.8 / 5.0",
                                    color = Color(0xFF22C55E),
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }

            // Dynamic Order Example (Simulating Live Feed)
            item {
                if (isOnline) {
                    Column {
                        Text(
                            text = "Order Menunggu Respon",
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        LancarGlassCard {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .background(
                                                color = Color(0xFF006437).copy(alpha = 0.2f),
                                                shape = RoundedCornerShape(4.dp)
                                            )
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = "2-Kaki Relay",
                                            color = Color(0xFF22C55E),
                                            fontSize = 12.sp
                                        )
                                    }
                                    Text(
                                        text = "⏱️ 24s",
                                        color = Color(0xFFFBBF24),
                                        fontSize = 12.sp
                                    )
                                }
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(
                                    text = "Pickup: Hub Sudirman",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "Tujuan: Hub Blok M",
                                    color = Color.Gray,
                                    fontSize = 14.sp
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                LancarTactileButton(
                                    onPressed = { /* Handle accept order logic */ },
                                    modifier = Modifier.fillMaxWidth(),
                                    backgroundColor = Color(0xFF006437)
                                ) {
                                    Text(
                                        text = "Terima Order - Rp 22.500",
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 40.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = Icons.Default.DirectionsBike,
                                contentDescription = "Bike Icon",
                                modifier = Modifier.size(64.dp),
                                tint = Color(0xFF3F3F46)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "Aktifkan status untuk melihat order",
                                color = Color(0xFF71717A),
                                fontSize = 14.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
```

---

## 8. RELEASE READINESS AUDIT CHECKLIST

Before deploying the built native Android client artifact onto the production channel, verify all security and design markers are satisfied:

- [ ] Touch target dimensions strictly exceed `48dp` on all custom Compose widgets.
- [ ] Local storage operations run exclusively on the encrypted **Room + SQLCipher** database.
- [ ] Root check (`RootBeer` library verification) successfully terminates untrusted sessions.
- [ ] GPS spoofing streams undergo Kalman velocity consistency checks.
- [ ] SSL Pinning is integrated via `OkHttpClient` CertificatePinner pointing to Gateway SHA-256 hash.
- [ ] Screen recording shielding (`FLAG_SECURE`) is active on sensitive pages.
- [ ] Loading animations utilize high-fidelity Compose Shimmer Skeleton Brush rather than spinner loops.
- [ ] Full visual compliance with Green Lancar (`#006437`) and glassmorphic designs is achieved.

---
**END OF SPECIFICATION DOCUMENT**
