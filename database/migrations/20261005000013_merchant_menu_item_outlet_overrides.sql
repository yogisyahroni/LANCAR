-- +goose Up
-- MWEB-PORTAL-P0-005: outlet-specific menu policy over the canonical menu item.
-- The base merchant_menu_items row remains the catalog source. This table only
-- stores a branch override, so clearing an override restores inheritance.
CREATE TABLE IF NOT EXISTS merchant_menu_item_outlet_overrides (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    menu_item_id        UUID NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    price_idr           BIGINT NULL CHECK (price_idr IS NULL OR price_idr >= 0),
    is_available        BOOLEAN NULL,
    promo_id            UUID NULL REFERENCES merchant_promos(id) ON DELETE SET NULL,
    version             BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_menu_item_outlet_override UNIQUE (menu_item_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_outlet_overrides_merchant_branch
    ON merchant_menu_item_outlet_overrides (merchant_id, branch_id, menu_item_id);

-- Idempotency is an operation concern, not a mutable property of the current
-- override. Keeping requests separately preserves replay semantics even after
-- a later edit changes the same menu/outlet pair.
CREATE TABLE IF NOT EXISTS merchant_menu_item_outlet_override_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    idempotency_key     VARCHAR(200) NOT NULL,
    request_fingerprint CHAR(64) NOT NULL,
    override_id         UUID NULL REFERENCES merchant_menu_item_outlet_overrides(id) ON DELETE SET NULL,
    result_json         JSONB NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ NULL,
    CONSTRAINT uq_menu_item_outlet_override_request UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_outlet_override_requests_created
    ON merchant_menu_item_outlet_override_requests (merchant_id, created_at DESC);

-- Guard all ownership links at the database boundary. The API also validates
-- them, but this prevents cross-tenant writes from any other caller.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION validate_menu_item_outlet_override()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    item_merchant UUID;
    branch_merchant UUID;
    promo_merchant UUID;
    promo_item UUID;
BEGIN
    SELECT merchant_id INTO item_merchant
      FROM merchant_menu_items WHERE id = NEW.menu_item_id;
    IF item_merchant IS NULL OR item_merchant <> NEW.merchant_id THEN
        RAISE EXCEPTION 'menu item bukan milik merchant override';
    END IF;

    SELECT merchant_id INTO branch_merchant
      FROM merchant_branches WHERE id = NEW.branch_id;
    IF branch_merchant IS NULL OR branch_merchant <> NEW.merchant_id THEN
        RAISE EXCEPTION 'outlet bukan milik merchant override';
    END IF;

    IF NEW.promo_id IS NOT NULL THEN
        SELECT merchant_id, menu_item_id INTO promo_merchant, promo_item
          FROM merchant_promos WHERE id = NEW.promo_id;
        IF promo_merchant IS NULL OR promo_merchant <> NEW.merchant_id THEN
            RAISE EXCEPTION 'promo bukan milik merchant override';
        END IF;
        IF promo_item IS NOT NULL AND promo_item <> NEW.menu_item_id THEN
            RAISE EXCEPTION 'promo tidak terkait menu item override';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_validate_menu_item_outlet_override
    ON merchant_menu_item_outlet_overrides;
CREATE TRIGGER trg_validate_menu_item_outlet_override
BEFORE INSERT OR UPDATE ON merchant_menu_item_outlet_overrides
FOR EACH ROW EXECUTE FUNCTION validate_menu_item_outlet_override();

COMMENT ON TABLE merchant_menu_item_outlet_overrides IS
'Per-outlet price/availability/promo override over merchant_menu_items. NULL inherits canonical catalog value.';

-- +goose Down
DROP TRIGGER IF EXISTS trg_validate_menu_item_outlet_override
    ON merchant_menu_item_outlet_overrides;
DROP FUNCTION IF EXISTS validate_menu_item_outlet_override();
DROP TABLE IF EXISTS merchant_menu_item_outlet_override_requests;
DROP TABLE IF EXISTS merchant_menu_item_outlet_overrides;
