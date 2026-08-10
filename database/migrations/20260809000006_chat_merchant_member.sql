-- +goose Up
-- ============================================================
-- FB-119: chat customer↔merchant — izinkan role 'merchant' sebagai
-- partisipan percakapan order (sebelumnya hanya customer/courier/
-- recipient/admin — untuk parcel). Food order kini punya merchant_id,
-- jadi merchant bisa chat dengan customer sebelum/selama proses masak.
-- ============================================================

ALTER TABLE order_conversation_members
  DROP CONSTRAINT order_conversation_members_member_type_check,
  ADD CONSTRAINT order_conversation_members_member_type_check
    CHECK (member_type IN ('customer', 'courier', 'recipient', 'admin', 'merchant'));

ALTER TABLE order_chat_read_receipts
  DROP CONSTRAINT order_chat_read_receipts_member_type_check,
  ADD CONSTRAINT order_chat_read_receipts_member_type_check
    CHECK (member_type IN ('customer', 'courier', 'recipient', 'admin', 'merchant'));

-- +goose Down
-- ============================================================
ALTER TABLE order_conversation_members
  DROP CONSTRAINT order_conversation_members_member_type_check,
  ADD CONSTRAINT order_conversation_members_member_type_check
    CHECK (member_type IN ('customer', 'courier', 'recipient', 'admin'));

ALTER TABLE order_chat_read_receipts
  DROP CONSTRAINT order_chat_read_receipts_member_type_check,
  ADD CONSTRAINT order_chat_read_receipts_member_type_check
    CHECK (member_type IN ('customer', 'courier', 'recipient', 'admin'));
