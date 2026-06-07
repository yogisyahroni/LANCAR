# Task: Mobile In-App Communication Customer & Kurir

## Ringkasan

Saat ini flow komunikasi customer dan kurir belum rapi untuk standar aplikasi kurir on-demand. Chat dasar sudah ada, tetapi masih berbentuk komunikasi dua pihak sederhana, call masih keluar aplikasi memakai dialer/WhatsApp, dan ada risiko target kontak salah karena field courier order mencampur nomor penerima sebagai `customer_phone`.

Target task ini adalah membuat komunikasi customer, kurir, dan penerima tetap berada di dalam ekosistem aplikasi TEMBUS, dengan target kontak yang benar di setiap status order, aman secara data pribadi, dan siap untuk flow pickup sampai delivery.

## Status Update - 2026-06-06

Legend:

- `[x]` selesai dan sudah ada bukti build/test atau implementasi langsung.
- `[/]` sebagian sudah dikerjakan, tetapi belum boleh dianggap production-complete.
- `[ ]` belum dikerjakan.

Yang sudah selesai pada implementasi terakhir:

- [x] Migration DB untuk `order_conversations`, `order_conversation_members`, `order_chat_read_receipts`, dan `order_call_sessions`.
- [x] Backend conversation service, chat membership authorization, idempotent chat message, dan read receipt.
- [x] Backend call session dengan short-lived join token yang disimpan dalam bentuk hash.
- [x] Socket signaling WebRTC: `call:incoming`, `call:offer`, `call:answer`, `call:ice_candidate`, `call:ringing`, `call:accepted`, `call:rejected`, `call:missed`, `call:ended`, dan `call:failed`.
- [x] TURN credential generation dari backend melalui `TURN_URLS`/`COTURN_URLS` + `COTURN_STATIC_AUTH_SECRET` atau static TURN username/password.
- [x] Android customer call screen, call repository, WebRTC audio client, incoming call handling, dan read receipt trigger.
- [x] Android courier call screen, call repository, WebRTC audio client, incoming call handling, dan read receipt trigger.
- [x] Revoke receiver location invite dari customer app dan backend.
- [x] Public recipient page diberi entry label "Paket Masuk".
- [x] Recipient logged-in customer app mendapat section "Paket Masuk" dari endpoint private berbasis phone hash.
- [x] Kurir setelah pickup diarahkan ke target komunikasi penerima, bukan lagi customer default.
- [x] Mapping mobile courier/customer tidak lagi mengirim nomor penerima sebagai `customer_phone`.
- [x] Rate limit khusus message/read/call route sudah dipasang.
- [x] Metrics dan audit event inti untuk message/call/access-denied/wrong-target sudah dipasang.
- [x] Config dan runbook coturn sudah tersedia di repo.

Yang masih belum boleh diklaim selesai:

- [ ] Deploy/config coturn nyata di staging/production belum dilakukan di repo ini.
- [ ] Device-to-device QA WebRTC dengan TURN asli belum dicatat.
- [x] Delivery group context setelah pickup sudah memakai conversation order yang sama, bukan membuat room baru.
- [/] Call/chat recipient sudah terpasang secara kontrak, tetapi belum dibuktikan QA dua device dengan recipient login nyata.
- [ ] Alerts formal, moderation/abuse report, retention policy, dan staging E2E script belum selesai.

Verification record:

- [x] `backend/admin-service`: `npm run build`.
- [x] `backend/admin-service`: `npm test -- --runInBand`.
- [x] `backend/admin-service`: `npm test -- --runInBand src/services/orderCommunication.test.ts`.
- [x] `backend/admin-service`: `npm test -- --runInBand src/onDemandRealtime.e2e.test.ts`.
- [x] `android-app-customer`: `.\gradlew.bat :app:assembleDebug`.
- [x] `android-app-customer`: `.\gradlew.bat :app:testDebugUnitTest`.
- [x] `android-app`: `.\gradlew.bat :app:assembleDebug`.
- [x] `android-app`: `.\gradlew.bat :app:testDebugUnitTest`.
- [x] `frontend`: `npm run build` dengan env `NEXT_PUBLIC_API_URL`, `SERVER_API_URL`, dan `NEXT_PUBLIC_SOCKET_URL`.
- [x] Migration `20260605000001_order_communication_webrtc.sql`: goose up/down di Postgres test container.
- [x] Migration `20260606000001_recipient_phone_hash.sql`: goose up/down di Postgres test container.

## Prinsip Produk

- Semua komunikasi utama harus in-app.
- Nomor HP asli customer, kurir, dan penerima tidak boleh menjadi mekanisme utama komunikasi.
- Kurir tidak boleh salah menghubungi penerima saat seharusnya menghubungi customer, dan sebaliknya.
- Setelah paket sudah diambil, penerima boleh masuk ke percakapan delivery jika identitasnya sudah aman.
- Jika penerima memakai aplikasi TEMBUS, pengalaman harus pindah ke aplikasi, bukan WhatsApp.
- Jika penerima belum memakai aplikasi, akses harus lewat link aman dengan token terbatas, bukan kontak bebas.
- Chat dan call harus punya audit trail, rate limit, dan authorization berbasis membership conversation.

## Non-Goal

- Tidak mengubah flow pembayaran.
- Tidak mengubah pricing service.
- Tidak mengganti maps/routing.
- Tidak membuka nomor HP asli ke lawan bicara.
- Tidak membangun fitur admin besar untuk moderation pada fase awal, kecuali audit minimum.
- Tidak membuat groupchat publik tanpa membership dan status order yang jelas.
- Tidak memakai provider VoIP berbayar sebagai jalur utama pada MVP.

## Keputusan Arsitektur Call

Call in-app wajib memakai WebRTC self-hosted sebagai baseline gratis.

Catatan penting:

- "Gratis" berarti tidak memakai provider komunikasi berbayar seperti Twilio atau Agora sebagai default.
- WebRTC tetap membutuhkan infrastruktur pendukung:
  - signaling server untuk offer, answer, ICE candidate, ringing, accept, reject, dan end call.
  - STUN server untuk koneksi peer-to-peer normal.
  - TURN server self-hosted, misalnya coturn, untuk fallback ketika jaringan mobile/NAT tidak bisa peer-to-peer.
- TURN server punya biaya infrastruktur bandwidth sendiri, tetapi tidak ada biaya per menit ke vendor VoIP.
- Tidak boleh fallback otomatis ke dialer eksternal atau WhatsApp.
- Jika WebRTC gagal, UI harus menawarkan retry atau support, bukan membuka aplikasi luar.
- Audio call MVP cukup voice-only. Video call bukan scope awal.
- Call tidak direkam. Yang disimpan hanya metadata audit seperti status, waktu mulai, waktu selesai, dan alasan gagal.
- Token signaling dan TURN credential harus short-lived.

## WebRTC Architecture Target

Komponen minimum:

- `CallSessionService`
  - membuat call session.
  - menentukan initiator dan target berdasarkan conversation membership.
  - menghasilkan signaling token short-lived.
  - mencatat lifecycle call.

- `CallSignalingGateway`
  - socket event untuk WebRTC signaling.
  - memvalidasi membership sebelum menerima offer/answer/ICE candidate.
  - tidak menyimpan SDP/ICE candidate permanen kecuali debug terbatas yang sudah disanitasi.

- `TurnCredentialService`
  - menghasilkan TURN credential short-lived.
  - memakai shared secret coturn atau credential backend-generated.
  - credential TTL pendek, misalnya 5 sampai 10 menit.

- `coturn`
  - self-hosted TURN server untuk staging dan production.
  - TLS enabled.
  - rate limit dan monitoring bandwidth.
  - credential tidak hardcoded di aplikasi mobile.

WebRTC signaling event:

- `call:offer`
- `call:answer`
- `call:ice_candidate`
- `call:ringing`
- `call:accepted`
- `call:rejected`
- `call:missed`
- `call:ended`
- `call:failed`

Security WebRTC:

- SDP dan ICE candidate tidak boleh ditulis ke log mentah.
- TURN shared secret hanya ada di backend/staging host, tidak pernah dikirim ke mobile.
- Mobile hanya menerima temporary TURN username/password.
- Socket signaling wajib reject user yang bukan member conversation.
- Satu user tidak boleh join call session milik order lain.
- Call session harus punya timeout ringing, misalnya 45 detik.
- Rate limit create call per actor dan per order.

## Kondisi Saat Ini

### Customer App

- Customer app sudah punya `ChatScreen` dan `ChatViewModel`.
- Chat join ke order room dan mengirim pesan lewat backend.
- Masih ada fallback WhatsApp di layar chat customer. Ini tidak sesuai keputusan "harus in-app".
- Tombol call pada tracking customer masih memakai Android dialer eksternal.
- Belum ada layar in-app voice call.
- Belum ada state percakapan berubah dari customer-kurir menjadi customer-kurir-penerima setelah pickup.

### Courier App

- Courier app sudah punya chat order dan socket order room.
- Tombol telepon pada detail order masih memakai Android dialer eksternal.
- Field `order.phoneNumber` berisiko salah target karena backend saat ini mengisi `customer_phone` dari `recipient_phone_masked`.
- Tidak ada contact target eksplisit seperti `customer`, `recipient`, atau `support`.
- Tidak ada mode groupchat setelah pickup.
- Tidak ada call recipient secara in-app.

### Backend

- Sudah ada tabel `order_chats`.
- Belum ada model conversation membership.
- Belum ada read receipt per member.
- Belum ada call session.
- Socket room masih berbasis `order:{orderId}` dengan akses customer atau courier.
- Belum ada penerima sebagai participant.
- Endpoint chat hanya membedakan sender `customer` dan `courier`.
- Belum ada aturan fase order untuk menentukan siapa boleh chat/call siapa.

## Flow Target

### 1. Order Belum Mendapat Kurir

- Customer tidak bisa chat/call kurir.
- UI menampilkan status menunggu kurir.
- Aksi yang tersedia:
  - hubungi support.
  - batalkan order jika policy mengizinkan.

### 2. Kurir Assigned, Belum Pickup

- Customer dan kurir masuk ke conversation 1:1.
- Customer bisa chat kurir lewat aplikasi.
- Kurir bisa chat customer lewat aplikasi.
- Customer bisa call kurir lewat in-app call.
- Kurir bisa call customer lewat in-app call.
- Penerima belum masuk groupchat.
- Kurir tidak boleh melihat atau memanggil penerima sebagai target utama kecuali policy service memerlukan koordinasi awal.

### 3. Pickup Berhasil Diverifikasi

- Setelah scan, foto, dan verifikasi pickup selesai, conversation berubah menjadi delivery conversation.
- Member conversation:
  - customer.
  - courier.
  - recipient jika sudah claim order atau membuka secure invite.
- Customer tetap bisa melihat conversation.
- Kurir bisa chat/call penerima untuk koordinasi dropoff.
- Customer bisa tetap ikut melihat konteks delivery agar tidak kehilangan kontrol order.
- Jika penerima belum join, pesan tetap terlihat oleh customer dan kurir saja.

### 4. In Transit

- Kurir melihat CTA komunikasi yang kontekstual:
  - chat penerima.
  - call penerima.
  - chat group order.
  - support/SOS terpisah.
- Customer melihat live tracking, status order, dan chat group order.
- Penerima melihat estimasi, kurir, dan chat/call kurir jika memakai aplikasi atau secure link.

### 5. Delivered

- Chat dikunci menjadi read-only setelah grace period, misalnya 24 jam.
- Call dinonaktifkan setelah delivery selesai.
- Aksi tersisa:
  - lihat POD.
  - lapor masalah.
  - hubungi support.

### 6. Failed Delivery

- On-demand: komunikasi tetap aktif sampai delivery selesai karena order wajib terkirim.
- Regular: komunikasi tetap aktif selama retry/reschedule.
- Jika return terjadi untuk regular setelah batas gagal, conversation berubah ke mode return context.

## Data Model Yang Dibutuhkan

### `order_conversations`

Menyimpan satu conversation utama per order.

Kolom minimum:

- `id`
- `order_id`
- `type`: `order_delivery`
- `phase`: `pre_pickup`, `post_pickup`, `delivered`, `closed`
- `status`: `active`, `read_only`, `closed`
- `created_at`
- `updated_at`

### `order_conversation_members`

Menentukan siapa yang boleh masuk room, membaca pesan, mengirim pesan, atau menerima call.

Kolom minimum:

- `id`
- `conversation_id`
- `order_id`
- `member_type`: `customer`, `courier`, `recipient`, `support`
- `member_id`: nullable untuk guest recipient
- `display_name`
- `role`
- `can_send_message`
- `can_start_call`
- `can_receive_call`
- `joined_at`
- `left_at`
- `created_at`

### `order_chat_messages`

Jika tetap memakai `order_chats`, perlu migration untuk mendukung conversation dan member. Lebih bersih jika membuat tabel baru lalu migrasi data lama.

Kolom minimum:

- `id`
- `conversation_id`
- `order_id`
- `sender_member_id`
- `message_type`: `text`, `system`, `image`, `pod_context`
- `body`
- `metadata_json`
- `client_message_id`
- `created_at`
- `deleted_at`

Constraint:

- unique `conversation_id, client_message_id` untuk idempotency.
- index `conversation_id, created_at`.

### `order_message_receipts`

Read/delivery state per member.

Kolom minimum:

- `id`
- `message_id`
- `member_id`
- `delivered_at`
- `read_at`

### `order_call_sessions`

In-app call session per order.

Kolom minimum:

- `id`
- `order_id`
- `conversation_id`
- `initiator_member_id`
- `target_member_id`
- `call_type`: `voice`
- `status`: `ringing`, `accepted`, `missed`, `rejected`, `ended`, `failed`
- `provider`: `webrtc`
- `signaling_room_id`
- `ring_timeout_at`
- `started_at`
- `answered_at`
- `ended_at`
- `ended_reason`
- `created_at`

### `recipient_order_identities`

Menghubungkan penerima ke order secara aman.

Kolom minimum:

- `id`
- `order_id`
- `recipient_user_id`: nullable
- `recipient_phone_hash`
- `invite_token_hash`
- `invite_expires_at`
- `claimed_at`
- `created_at`

## Backend API Target

### Conversation

- `GET /api/v1/mobile/orders/:orderId/conversation`
  - Mengembalikan member, phase, permission, unread count, dan pesan terbaru.
  - Tidak mengembalikan nomor HP asli.

- `POST /api/v1/mobile/orders/:orderId/messages`
  - Mengirim pesan in-app.
  - Body wajib punya `client_message_id`.
  - Harus validate membership, phase, dan permission.

- `PATCH /api/v1/mobile/orders/:orderId/conversation/read`
  - Mark pesan terbaca sampai message tertentu.

### Call

- `POST /api/v1/mobile/orders/:orderId/calls`
  - Membuat in-app call session.
  - Body target: `customer`, `courier`, atau `recipient`.
  - Backend menentukan target member valid berdasarkan status order.

- `POST /api/v1/mobile/orders/:orderId/calls/:callId/join`
  - Mengembalikan token join call yang short-lived.
  - Token tidak boleh disimpan panjang di client.

- `POST /api/v1/mobile/orders/:orderId/calls/:callId/end`
  - Menutup call session.

### Recipient Invite

- `POST /api/v1/mobile/orders/:orderId/recipient-invite`
  - Membuat link aman untuk penerima.
  - Token disimpan dalam bentuk hash.
  - TTL pendek, misalnya 24 jam atau mengikuti status order.

- `POST /api/v1/mobile/recipient/orders/:orderId/claim`
  - Penerima claim order dari app atau secure link.
  - Jika penerima login di customer app, link ke user id.

## Socket Event Target

- `conversation:joined`
- `conversation:members_changed`
- `message:new`
- `message:delivered`
- `message:read`
- `call:incoming`
- `call:accepted`
- `call:rejected`
- `call:missed`
- `call:ended`
- `call:failed`

Socket authorization harus berdasarkan `order_conversation_members`, bukan hanya order customer/courier.

## Mobile Customer App Tasks

### P0 - Hilangkan Jalur Komunikasi Eksternal

- [x] Hapus fallback WhatsApp dari chat customer.
- [x] Ganti call dialer eksternal dengan in-app call screen dan fallback aman jika call belum siap penuh.
- [x] Copy UI harus jelas:
  - "Panggilan dalam aplikasi sedang disiapkan" untuk sementara.
  - Tidak menampilkan nomor HP.
- [x] Pastikan tidak ada `wa.me`, `ACTION_DIAL`, atau direct phone target pada customer flow komunikasi utama.
- [x] Hapus nomor telepon kurir dari navigation route chat customer.
- [x] Hapus raw chat payload log dari socket customer.

### P1 - Conversation UI

- [x] Buat conversation entry point dari:
  - tracking screen.
  - order detail.
  - active order card.
- [x] UI menampilkan:
  - nama kurir.
  - status online/offline jika ada.
  - konteks pengiriman aktif.
- [ ] Pesan sistem saat kurir assigned, pickup verified, delivered.
- [x] Support:
  - sending state.
  - failed send retry.
  - empty state enterprise-clean.
- [x] Read receipt per member setelah backend conversation membership tersedia.

### P2 - In-App Call UI

- [x] Buat call screen:
  - outgoing call.
  - incoming call.
  - accepted call.
  - ended/missed call.
- [x] Android permission:
  - microphone.
- [ ] Android permission:
  - foreground service jika dibutuhkan.
- [x] Fallback jika call init gagal:
  - tampilkan error ramah.
  - jangan membuka dialer eksternal otomatis.
- [/] WebRTC audio connection end-to-end setelah signaling backend dan courier receiver siap.
  - Backend signaling, Android customer, dan Android courier sudah terpasang.
  - Masih perlu QA dua device/emulator dengan TURN asli.

### P3 - Recipient Experience

- [/] Jika customer membuat invite penerima:
  - [x] tampilkan status invite.
  - [x] bisa resend link.
  - [x] bisa revoke link.
- [/] Jika penerima login memakai app:
  - [/] order muncul sebagai "Paket Masuk" pada public recipient web flow.
  - [x] order muncul sebagai "Paket Masuk" pada aplikasi recipient login.
  - [/] bisa chat/call kurir setelah pickup.
    - Backend membership dan target call sudah ada.
    - QA dua device dengan recipient login nyata belum dicatat.

## Mobile Courier App Tasks

### P0 - Betulkan Target Kontak

- [x] Jangan pakai `order.phoneNumber` sebagai target komunikasi utama.
- [/] Tambahkan contact target eksplisit:
  - `customer_contact`
  - `recipient_contact`
  - `support_contact`
- [/] Backend harus mengirim metadata target tanpa nomor asli.
- [/] UI courier harus menampilkan aksi sesuai fase:
  - [x] sebelum pickup: chat/call customer.
  - [x] setelah pickup: chat/call penerima dan group chat order.
    - Target call penerima sudah dipasang.
    - Chat tetap memakai satu conversation order yang berubah menjadi konteks grup pengantaran.
  - [ ] delivered: read-only/support.

### P1 - Conversation UI Courier

- [x] Chat order harus memakai conversation member.
- [/] Tampilkan label jelas:
  - "Customer"
  - "Penerima"
  - "Support"
- [x] Jangan memakai copy teknis seperti id, room, atau provider.
- [/] Jika multi-order aktif:
  - [x] chat dipisah per order.
  - [/] tidak boleh mengirim pesan ke order yang salah.

### P2 - In-App Call Courier

- [/] Tambahkan call button berbasis target:
  - [x] call customer.
  - [/] call penerima.
    - Target recipient sudah dipilih setelah pickup.
    - E2E device dengan recipient login belum dicatat.
- [/] Call harus berjalan di aplikasi.
- [x] Jika call gagal, tampilkan pilihan retry atau hubungi support.
- [x] Jangan fallback otomatis ke nomor telepon eksternal.

### P3 - Delivery Group Context

- [x] Setelah pickup verified, tampilkan conversation group context.
- [x] Pesan sistem:
  - "Paket sudah diambil. Penerima dapat bergabung untuk koordinasi pengantaran."
- [x] Satu conversation order berubah menjadi grup pengantaran; tidak membuat chat room baru.
- [x] Kurir tetap berada di chat order yang sama, sementara call target berubah ke penerima setelah pickup.
- [x] Recipient tidak melihat histori privat pre-pickup selain pesan sistem yang aman.
- [x] Call ke penerima hanya aktif saat delivery berjalan (`picked_up`, `in_transit`, `delivering`), bukan setelah order delivered/completed.

## Backend Tasks

### P0 - Contract dan Data Safety

- [x] Tambahkan migration conversation tables.
- [/] Backfill conversation untuk order aktif.
  - Conversation saat ini dibuat lazily saat order/chat/call diakses.
- [x] Tambahkan service `OrderConversationService`.
  - Implementasi bernama `orderCommunication.ts`.
- [x] Ubah chat endpoint agar memakai membership.
- [/] Tambahkan contact target resolver.
  - Call target resolver sudah ada untuk customer/courier.
  - Recipient target sudah berbasis phone hash.
  - Support target masih belum lengkap.
- [x] Perbaiki mapping courier order yang saat ini mengisi `customer_phone` dari `recipient_phone_masked`.
- [x] Pastikan payload mobile tidak mengirim raw phone di seluruh courier/customer order payload.

### P1 - Socket Membership

- [x] Ubah join room agar validasi ke `order_conversation_members`.
- [/] Emit event ke member conversation.
  - Call signaling sudah diarahkan ke target user/call room.
  - Chat broadcast lama masih perlu diaudit total agar tidak ada order-room generik tersisa.
- [/] Tambahkan ack untuk delivered/read.
  - Read receipt sudah ada.
  - Delivered ack belum lengkap.
- [ ] Tambahkan reconnect state sync.
- [x] Tambahkan rate limit pesan per order dan per actor.

### P2 - Call Session

- [/] Implementasi wajib memakai WebRTC self-hosted.
  - Kode backend dan Android sudah memakai WebRTC.
  - QA device-to-device dengan TURN asli belum dicatat.
- [x] Tambahkan signaling socket untuk offer, answer, ICE candidate, ringing, accepted, rejected, missed, ended, dan failed.
- [x] Tambahkan TURN credential service dengan credential short-lived.
- [x] Tambahkan konfigurasi coturn untuk staging dan production.
  - File compose, contoh config, dan runbook sudah ada.
  - Deployment host nyata masih open item di bagian status.
- [x] Buat call session endpoint.
- [x] Generate short-lived join token.
- [x] Generate short-lived TURN credential.
- [x] Simpan metadata call, bukan audio.
- [/] Audit call start/end/missed.
  - Metadata lifecycle tersimpan di `order_call_sessions`.
  - Audit event formal terpisah belum lengkap.

### P3 - Recipient Identity

- [/] Buat secure invite token.
  - Receiver location token existing dipakai untuk public flow.
  - Invite conversation/claim recipient belum lengkap.
- [x] Link recipient app user dengan order berdasarkan verified phone hash.
- [/] Tambahkan guest recipient membership dengan TTL jika belum punya akun.
  - Guest recipient member nullable bisa dibuat pada conversation phase tertentu.
  - TTL/claim policy belum lengkap.
- [ ] Revoke membership setelah order closed atau token expired.

### P4 - Observability dan Abuse Control

- [x] Metrics:
  - message send success/failure.
  - socket join denied.
  - call started/accepted/missed/failed.
  - wrong target prevention count.
- [ ] Alerts:
  - call failure rate tinggi.
  - socket authorization denied spike.
  - message delivery backlog.
- [ ] Moderation minimum:
  - report conversation.
  - block abusive guest token.

## Security Requirements

- Jangan log nomor telepon, token call, invite token, atau raw message body di production logs.
- Jangan log SDP, ICE candidate, TURN credential, atau signaling token secara mentah.
- Semua token invite disimpan hash.
- Call join token TTL maksimum 5 menit.
- TURN credential TTL maksimum 10 menit.
- Conversation membership wajib dicek di semua endpoint dan socket event.
- Message send wajib punya idempotency key.
- Rate limit:
  - send message.
  - create call.
  - recipient claim.
  - invite resend.
- Recipient guest access harus scope per order, bukan akses akun customer.
- Attachments jika nanti ditambah harus scan file dan pakai signed URL.
- Audit log wajib untuk:
  - member added.
  - member removed.
  - call started.
  - call ended.
  - invite generated.
  - invite revoked.

## UX Requirements

- Tidak ada tulisan teknis seperti `socket`, `room`, `POD+face`, atau provider call di UI utama.
- Tombol komunikasi harus kontekstual, bukan generik.
- State kosong harus menjelaskan status order, bukan debug.
- Loading pakai skeleton atau state visual, bukan teks mentah "Loading...".
- Error harus actionable:
  - "Tidak bisa memulai panggilan. Coba lagi atau hubungi support."
  - bukan stack trace atau error provider.
- Semua tombol call/chat harus punya feedback tekan, loading, success, dan failure.

## Acceptance Criteria

### Functional

- Customer bisa chat kurir setelah order assigned.
- Courier bisa chat customer setelah order assigned.
- Customer dan courier tidak bisa chat sebelum order assigned.
- Setelah pickup verified, recipient bisa menjadi participant jika invite/claim valid.
- Courier bisa chat/call recipient setelah pickup.
- Customer tetap bisa melihat delivery conversation setelah pickup.
- Delivered order menjadi read-only setelah grace period.
- No WhatsApp fallback pada customer/courier communication flow.
- No external dialer sebagai primary communication flow.
- Wrong target call tidak mungkin terjadi karena target ditentukan server.

### Security

- Raw phone tidak muncul di payload mobile.
- Unauthorized user tidak bisa join order room.
- Expired invite tidak bisa claim conversation.
- User dari order lain tidak bisa baca pesan.
- Call token tidak bisa dipakai ulang setelah expired.
- Rate limit bekerja pada spam message dan call spam.

### UX

- Customer dan courier UI menampilkan target komunikasi yang jelas.
- Chat/call actions berubah sesuai order phase.
- Failed send bisa retry.
- Incoming call tampil jelas.
- Empty state dan error state enterprise-clean.

## Test Plan

### Backend

- Unit test:
  - contact target resolver.
  - membership permission.
  - phase transition conversation.
  - invite token hash/expiry.
  - call session lifecycle.
- Integration test:
  - customer send message to assigned courier.
  - courier send message to customer.
  - recipient claim after pickup.
  - unauthorized actor denied.
  - expired invite denied.
  - delivered conversation read-only.

### Android Customer

- Build:
  - `.\gradlew.bat :app:assembleDebug`
  - `.\gradlew.bat :app:testDebugUnitTest`
- Emulator QA:
  - assigned order opens chat.
  - chat send/retry works.
- call button opens in-app call screen.
- WebRTC voice call can connect on emulator/device using signaling and TURN fallback.
- WhatsApp and dialer do not open.
- recipient invite visible only when relevant.
- text remains readable on light and dark input backgrounds.

### Android Courier

- Build:
  - `.\gradlew.bat :app:assembleDebug`
  - `.\gradlew.bat :app:testDebugUnitTest`
- Emulator/device QA:
  - before pickup: contact action points to customer.
  - after pickup: contact action points to recipient.
  - group conversation visible after pickup.
- multi-order chat cannot cross-send to wrong order.
- WebRTC voice call can connect to customer and recipient target when allowed.
- external dialer does not open.

### End-to-End

- Flow 1:
  - customer creates order.
  - courier accepts.
  - customer sends chat.
  - courier replies.
  - customer starts in-app call.
- Flow 2:
  - courier completes pickup verification.
  - recipient claims invite.
  - group conversation active.
  - courier calls recipient in-app.
  - delivery completed.
  - conversation read-only after grace period.

## Priority Checklist

### P0 - Stop Salah Target dan External Communication

- [x] Remove WhatsApp fallback from customer chat.
- [x] Remove/disable `ACTION_DIAL` from customer communication primary flow.
- [x] Remove/disable `ACTION_DIAL` from courier communication primary flow.
- [/] Add backend contact target resolver.
- [x] Fix courier order payload so `customer_phone` is not filled from recipient phone.
- [x] Add conversation membership migration.
- [x] Update chat authorization to use membership.
- [x] Add tests for wrong target prevention.

### P1 - In-App Chat Proper

- [x] Add conversation API contract.
- [x] Add member-based socket room.
- [x] Add message idempotency.
- [x] Add read receipt.
- [x] Add customer chat UI states.
- [/] Add courier chat UI states.
- [ ] Add reconnect state sync.

### P2 - In-App Call MVP

- [/] Implement self-hosted WebRTC as the only MVP call provider.
- [x] Add call session DB table.
- [x] Add call session endpoints.
- [x] Add short-lived call tokens.
- [x] Add WebRTC signaling socket events.
- [x] Add short-lived TURN credential endpoint.
- [x] Add coturn staging config.
- [x] Add Android customer call screen.
- [x] Add Android courier call screen.
- [/] Add call notifications.
- [/] Add call timeout, missed call, reject call, and reconnect handling.
- [x] Add call lifecycle tests.

### P3 - Recipient Groupchat

- [/] Add recipient identity model.
- [/] Add secure recipient invite.
- [/] Add recipient claim endpoint.
- [/] Add post-pickup membership transition.
- [/] Add recipient app entry point.
- [x] Add group conversation UI.
- [/] Add recipient call target after pickup.

### P4 - Hardening dan Observability

- [/] Add audit logs.
- [ ] Add abuse report.
- [/] Add metrics and alerts.
- [x] Add message/call rate limits.
- [ ] Add retention policy.
- [ ] Add staging E2E QA script.

## Open Decisions

- Pilih detail implementasi WebRTC Android yang paling stabil dan maintained saat pengerjaan dimulai.
- Pilih lokasi deployment coturn untuk staging dan production.
- Apakah recipient tanpa aplikasi boleh memakai secure web guest, atau wajib install/login aplikasi.
- Grace period chat setelah delivered: 24 jam, 48 jam, atau mengikuti service.
- Apakah customer boleh call recipient langsung setelah pickup, atau hanya courier yang boleh call recipient.
- Apakah support harus bisa join conversation sebagai admin escalation pada P1 atau P4.

## Recommended Execution Order

1. Kerjakan P0 dulu untuk menutup risiko salah target dan komunikasi keluar aplikasi.
2. Lanjut P1 agar chat menjadi benar secara domain dan tidak hanya order room generik.
3. Lanjut P2 untuk in-app call MVP.
4. Lanjut P3 agar penerima bisa masuk flow setelah pickup.
5. Tutup dengan P4 untuk observability, abuse control, dan audit.
