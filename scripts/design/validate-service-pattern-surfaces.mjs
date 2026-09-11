import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const protectedSurfaceGroups = [
  {
    name: "Tambal/Towing active service flow",
    paths: [
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceBookingScreen.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceTrackingScreen.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceReportScreen.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/NearbyCouriersScreen.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TambalBanHomeScreen.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TambalBanSearchScreen.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/CourierDetailScreen.kt",
    ],
  },
  {
    name: "Aggregator carrier-rate comparison",
    paths: [
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingScreen.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingComponents.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingStepContent.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingModalSheets.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/components/CourierPriceCard.kt",
      "android-app-customer/app/src/main/java/com/tembus/customer/ui/designsystem/logistics/TembusLogistics.kt",
    ],
  },
];

const forbiddenPaidInventoryTokens = [
  /\bisSponsored\b/i,
  /\bsponsoredCampaignId\b/i,
  /\brecordSponsoredEvent\b/i,
  /\badLabel\b/i,
  /\bad_delivery_token\b/i,
  /\bcampaign_id\b/i,
  /\badvertis(?:ing|ement)?\b/i,
  /paid\s+placement/i,
  /\bads[-_ ]service\b/i,
];

const failures = [];
for (const group of protectedSurfaceGroups) {
  for (const relativePath of group.paths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`${group.name}: missing required surface ${relativePath}`);
      continue;
    }
    const source = fs.readFileSync(absolutePath, "utf8");
    for (const token of forbiddenPaidInventoryTokens) {
      const match = source.match(token);
      if (match) {
        failures.push(`${group.name}: ${relativePath} contains ${match[0]}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("FAIL — protected service surfaces contain paid-inventory integration:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("PASS — Tambal/Towing active flows and Aggregator carrier comparison are ad-free by source guard.");
}
