# ERD v1.4 Aggregator (Zero COD & Bulk Payment Link)
## 1. Modifikasi Tabel orders
- awb_number (VARCHAR)
- tracking_url (VARCHAR)
- Status ready_for_pickup ditambahkan.
## 2. Webhook Flow
Webhook settlement mengubah payment link menjadi PAID, lalu auto-generate AWB via awbClient, dan mengubah status order ke ready_for_pickup.
