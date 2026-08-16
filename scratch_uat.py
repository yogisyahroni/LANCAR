import json, urllib.request, urllib.error

BASE = "http://localhost:8080/api/v1"

def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"http_error": e.code, "body": e.read().decode()[:500]}

# 1. customer login
lg = call("POST", "/auth/customer/login/start", {
    "email": "customer@tembus.id", "password": "Customer123!",
    "device_id": "uat-tambal", "device_info": "emulator"})
tok = lg.get("access_token") or (lg.get("data") or {}).get("access_token")
print("login:", "OK" if tok else lg)

# 2. calculate (home-service: pickup == dropoff)
calc = call("POST", "/customer/orders/calculate", {
    "service_code": "tambal_ban_motor",
    "pickup": {"lat": -6.2, "lng": 106.816666},
    "dropoff": {"lat": -6.2, "lng": 106.816666},
    "dimensions": {"length": 0, "width": 0, "height": 0},
    "weight_kg": 0,
    "has_insurance": False,
    "item_value": 0,
    "dimension_scan_verified": True,
    "size_tier": None
}, tok)
print("calculate:", json.dumps(calc, ensure_ascii=False)[:200], "...")

# 3. create order (home-service: pickup == dropoff address sama)
pb = calc  # PriceBreakdown response langsung jadi price_breakdown
create = call("POST", "/customer/orders", {
    "pickup_address": "Jl. Dukuh Pinggir 2 No 34, Tanah Abang",
    "pickup_location": {"lat": -6.2, "lng": 106.816666},
    "dropoff_address": "Jl. Dukuh Pinggir 2 No 34, Tanah Abang",
    "dropoff_location": {"lat": -6.2, "lng": 106.816666},
    "recipient_name": "Customer UAT",
    "recipient_phone": "081234567890",
    "package_details": {
        "size_tier": "regular",
        "weight_kg": 0,
        "dimensions": {"length": 0, "width": 0, "height": 0},
        "dimensions_scanned": True,
        "requires_delivery_code": False,
        "item_description": "Kendaraan: Matic; Kerusakan: Ban Bocor"
    },
    "has_insurance": False,
    "item_value": 0,
    "schedule_type": "now",
    "customer_notes": "",
    "price_breakdown": pb,
    "service_code": "tambal_ban_motor",
    "preferred_courier_id": "d8180681-082f-4fa0-ba37-807b7262afc1"
}, tok)
print("create:", json.dumps(create, ensure_ascii=False)[:400])

oid = (create.get("order") or {}).get("id")
print("ORDER_ID:", oid)