#!/bin/bash
# Capture remaining 7 merchant ZIP routes with robust timeout handling
export PATH="/c/Users/yogis/AppData/Local/Android/Sdk/platform-tools:$PATH"
OUT="artifacts/merchant-zip-ui-uat/screenshots"
mkdir -p "$OUT"

# Remaining routes
routes=(
  "order_detail_merchant|tembusmerchant://merchant/orders/FOOD-E2E-DELIVERED"
  "order_detail_cancelled|tembusmerchant://merchant/orders/FOOD-E2E-CANCELED/cancelled"
  "order_detail_rejected|tembusmerchant://merchant/orders/FOOD-E2E-REJECTED/rejected"
  "create_promo|tembusmerchant://merchant/promo/create"
  "edit_menu|tembusmerchant://merchant/menu/menu_123/edit"
  "add_menu|tembusmerchant://merchant/menu/add"
  "variants|tembusmerchant://merchant/menu/item_456/variants"
)

for entry in "${routes[@]}"; do
  IFS='|' read -r name link <<< "$entry"
  echo "=== $name ==="
  timeout 15 adb shell am start -n "com.tembus.merchant/com.tembus.merchant.MainActivity" -d "$link" 2>&1
  sleep 4
  timeout 10 adb shell uiautomator dump /sdcard/wd_$name.xml 2>/dev/null
  timeout 5 adb pull /sdcard/wd_$name.xml "$OUT/hierarchy_$name.xml" 2>/dev/null
  timeout 8 adb exec-out screencap -p > "$OUT/screenshot_$name.png" 2>/dev/null
  texts=$(grep -o 'text="[^"]*"' "$OUT/hierarchy_$name.xml" 2>/dev/null | grep -v 'text=""' | tr '\n' '|' | head -c 400)
  echo "RESULT: $texts"
done
echo "== ALL DONE =="