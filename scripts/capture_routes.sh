#!/bin/bash
# Capture all 17 merchant ZIP routes via deep link + uiautomator dump + screencap
export PATH="/c/Users/yogis/AppData/Local/Android/Sdk/platform-tools:$PATH"

OUT="artifacts/merchant-zip-ui-uat/screenshots"
mkdir -p "$OUT"

# Routes: "label|deeplink"
routes=(
  "orders_dashboard|tembusmerchant://merchant/orders/dashboard"
  "manage_menu|tembusmerchant://merchant/menu"
  "business_insights|tembusmerchant://merchant/insights"
  "store_profile|tembusmerchant://merchant/profile"
  "order_history|tembusmerchant://merchant/orders/history"
  "order_detail_merchant|tembusmerchant://merchant/orders/ord_123"
  "order_detail_cancelled|tembusmerchant://merchant/orders/ord_456/cancelled"
  "order_detail_rejected|tembusmerchant://merchant/orders/ord_789/rejected"
  "create_promo|tembusmerchant://merchant/promo/create"
  "customer_reviews|tembusmerchant://merchant/profile/reviews"
  "payment_settings|tembusmerchant://merchant/profile/payment"
  "operating_hours|tembusmerchant://merchant/profile/hours"
  "edit_public_profile|tembusmerchant://merchant/profile/edit"
  "store_information|tembusmerchant://merchant/profile/information"
  "edit_menu|tembusmerchant://merchant/menu/menu_123/edit"
  "add_menu|tembusmerchant://merchant/menu/add"
  "variants|tembusmerchant://merchant/menu/item_456/variants"
)

for entry in "${routes[@]}"; do
  IFS='|' read -r name link <<< "$entry"
  echo "=== $name ($link) ==="
  adb shell am start -n "com.tembus.merchant/com.tembus.merchant.MainActivity" -d "$link" >/dev/null 2>&1
  sleep 3
  adb shell uiautomator dump /sdcard/window_$name.xml >/dev/null 2>&1
  adb pull /sdcard/window_$name.xml "$OUT/hierarchy_$name.xml" >/dev/null 2>&1
  adb exec-out screencap -p > "$OUT/screenshot_$name.png" 2>/dev/null
  # Extract visible text
  texts=$(grep -o 'text="[^"]*"' "$OUT/hierarchy_$name.xml" | grep -v 'text=""' | tr '\n' ' ' | head -c 500)
  echo "$name: $texts"
  echo ""
done
echo "=== ALL ROUTES DONE ==="