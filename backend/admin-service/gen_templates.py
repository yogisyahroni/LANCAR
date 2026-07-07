"""
TEMBUS Resi Template v4.0 — Layout Original Presisi (Full Width Address)
Canvas: 384 x 576 px (A6 thermal print)

Struktur Zona:
  y=0   – 45   : Header (TEMBUS logo + Logo Kurir)
  y=45  – 45   : --- separator ---
  y=48  – 135  : No. Resi Besar + Barcode AWB
  y=135 – 135  : --- separator ---
  y=138 – 290  : PENERIMA (Full Width atas) & PENGIRIM (Full Width bawah)
  y=290 – 290  : --- separator ---
  y=292 – 375  : Info paket 2 kolom (Isi | Berat, Qty, Harga)
  y=375 – 375  : --- separator ---
  y=378 – 476  : QR Tracking + Panduan Lacak
  y=476 – 476  : --- separator ---
  y=480 – 576  : Footer (Order ID Barcode + Branding TEMBUS terpisah jelas)
"""
import json
import uuid


def E(type, x, y, w=None, h=None, val="", font_size=12, fw="normal", bar_width=None):
    el = {
        "id": str(uuid.uuid4()),
        "type": type,
        "x": x,
        "y": y,
        "value": val,
        "fontSize": font_size,
    }
    if w is not None:
        el["width"] = w
    if h is not None:
        el["height"] = h
    if type == "text":
        el["fontWeight"] = fw
    if bar_width is not None:
        el["barWidth"] = bar_width
    return el


def SEP(y, h=2):
    """Horizontal separator full width."""
    return E("h_line", 10, y, w=364, h=h)


def VSEP(x, y_start, h):
    """Vertical separator antar 2 kolom."""
    return E("v_line", x, y_start, w=1, h=h)


def build_template():
    els = []

    # ── ZONA 1: HEADER & DUAL BRANDING (y=0–45) ──────────────────────────────
    els.append(E("tembus_logo", 12,  8, w=120, h=30))
    els.append(E("logo",      252,  8, w=120, h=32, val="provider_logo"))
    els.append(SEP(45, h=2))

    # ── ZONA 2: MAIN AWB BARCODE (y=48–135) ──────────────────────────────────
    els.append(E("text", 12, 50, val="No. Resi:  {{awb_number}}", font_size=13, fw="bold"))
    els.append(E("text", 260, 50, val="LAYANAN: {{service_type}}", font_size=11, fw="bold"))
    els.append(E("barcode", 12, 75, h=50, val="{{awb_number}}", bar_width=1.8))
    els.append(SEP(135, h=2))

    # ── ZONA 3: RECIPIENT & SENDER FULL WIDTH (y=138–290) ────────────────────
    # PENERIMA (Prioritas Utama Kurir Pengantar — Full 360px Width)
    els.append(E("text", 12, 143, val="PENERIMA / RECIPIENT :", font_size=9, fw="bold"))
    els.append(E("text", 12, 157, val="{{receiver_name}}", font_size=13, fw="bold"))
    els.append(E("text", 12, 175, val="Telp: {{receiver_phone}}", font_size=11))
    els.append(E("text", 12, 191, val="{{receiver_address}}", font_size=10))

    # Thin separator line antara Penerima & Pengirim
    els.append(SEP(214, h=1))

    # PENGIRIM (Sender — Full Width di bawahnya)
    els.append(E("text", 12, 222, val="PENGIRIM / SENDER :", font_size=9, fw="bold"))
    els.append(E("text", 12, 236, val="{{sender_name}}", font_size=11, fw="bold"))
    els.append(E("text", 12, 252, val="Telp: {{sender_phone}}", font_size=10))
    els.append(E("text", 12, 268, val="{{sender_address}}", font_size=9))

    els.append(SEP(290, h=2))

    # ── ZONA 4: PACKAGE DETAILS (y=292–375) ──────────────────────────────────
    # Kiri: Isi paket (x=12 to 210)
    els.append(E("text", 12, 298, val="ISI PAKET / CONTENT:", font_size=9, fw="bold"))
    els.append(E("text", 12, 312, val="{{item_names}}", font_size=10))
    els.append(E("text", 12, 334, val="CATATAN / NOTE:", font_size=8, fw="bold"))
    els.append(E("text", 12, 346, val="Wajib video unboxing untuk klaim.", font_size=8))

    # Vertical separator line
    els.append(VSEP(220, 298, 68))

    # Kanan: Berat, Qty, Total Harga (x=230 to 370)
    els.append(E("text", 230, 298, val="BERAT: {{total_weight}} KG", font_size=10, fw="bold"))
    els.append(E("text", 230, 316, val="QTY  : {{total_items}} PCS", font_size=10, fw="bold"))
    els.append(E("text", 230, 342, val="TOTAL BIAYA:", font_size=8))
    els.append(E("text", 230, 354, val="Rp {{total_price_idr}}", font_size=12, fw="bold"))

    els.append(SEP(375, h=2))

    # ── ZONA 5: TRACKING QR CODE & INSTRUCTIONS (y=378–476) ──────────────────
    els.append(E("qrcode", 16, 384, w=82, h=82, val="{{tracking_url}}"))

    els.append(E("text", 110, 388, val="SCAN QR UNTUK LACAK PAKET", font_size=11, fw="bold"))
    els.append(E("text", 110, 406, val="Lacak status pengiriman secara", font_size=9))
    els.append(E("text", 110, 420, val="real-time melalui sistem TEMBUS.", font_size=9))
    els.append(E("text", 110, 442, val="Website: www.tembus.id", font_size=10, fw="bold"))

    els.append(SEP(476, h=2))

    # ── ZONA 6: FOOTER & ORDER ID (y=478–576) ────────────────────────────────
    els.append(E("text", 12, 484, val="Order ID: {{order_id}}", font_size=9, fw="bold"))
    # Barcode order ID compact (w max ~170px, barWidth 1.2)
    els.append(E("barcode", 12, 506, h=34, val="{{order_id}}", bar_width=1.2))

    # Branding TEMBUS terpisah jauh di kanan (x=230)
    els.append(E("text", 230, 484, val="Powered by TEMBUS", font_size=10, fw="bold"))
    els.append(E("text", 230, 502, val="Kirim aman, sampai tujuan.", font_size=8))
    els.append(E("text", 230, 516, val="Platform Logistik Terpadu", font_size=8))
    els.append(E("text", 230, 534, val="tembus.id", font_size=10, fw="bold"))

    return els


templates = [
    ("JNE - TEMBUS 2026",     "jne",      build_template()),
    ("JT - TEMBUS 2026",      "jnt",      build_template()),
    ("SiCepat - TEMBUS 2026", "sicepat",  build_template()),
    ("AnterAja - TEMBUS 2026","anteraja",  build_template()),
]

sql  = "BEGIN;\n\n"
sql += "DELETE FROM resi_templates WHERE provider_code IN ('jne','jnt','sicepat','anteraja');\n\n"
for name, code, els in templates:
    cfg = json.dumps({"layout": "tembus_v4", "elements": els}).replace("'", "''")
    sql += (
        f"INSERT INTO resi_templates (name, paper_size, layout_config, is_active, provider_code)\n"
        f"VALUES ('{name}', 'A6', '{cfg}'::jsonb, true, '{code}');\n\n"
    )
sql += "COMMIT;\n"

with open("seed_3pl_templates.sql", "w", encoding="utf-8") as f:
    f.write(sql)

print("OK gen_templates v4 done")
for name, code, _ in templates:
    print(f"  [{code}] {name}")
