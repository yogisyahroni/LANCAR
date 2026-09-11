import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const surfaces = [
  "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt",
  "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/payment/PaymentScreen.kt",
  "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/tracking/TrackingScreen.kt",
  "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/tracking/TrackingDetailSections.kt",
];
const forbidden = /isSponsored|sponsoredCampaignId|recordSponsoredEvent|adLabel|campaign_id|advertising|paid\s+placement|ads\s+service/i;
const failures = [];

for (const relativePath of surfaces) {
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(forbidden);
  if (match) failures.push(`${relativePath}: forbidden paid-inventory token '${match[0]}'`);
}

if (failures.length) {
  console.error("Food transaction surfaces must remain ad-free:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`PASS — ${surfaces.length} Food checkout/payment/tracking surfaces contain no paid-inventory integration tokens.`);
