-- +goose Up

INSERT INTO feature_flags (key, is_enabled, description, created_at, updated_at)
VALUES
    ('customer_apple_login_enabled',        false, 'Enable Apple login for customer web and Android', now(), now()),
    ('customer_apple_registration_enabled', false, 'Enable Apple registration for new customers', now(), now()),
    ('customer_apple_linking_enabled',      false, 'Allow existing customers to link their Apple account', now(), now())
ON CONFLICT (key) DO UPDATE SET
    description = EXCLUDED.description,
    updated_at = now();

-- +goose Down

DELETE FROM feature_flags
WHERE key IN (
    'customer_apple_login_enabled',
    'customer_apple_registration_enabled',
    'customer_apple_linking_enabled'
);
