# Data classification and governance — PART AD

Classification is applied at field level: public (catalog/aggregate metrics),
internal (operational IDs and configuration), confidential (account/order,
location, support and reputation evidence), and restricted (credentials,
payment tokens, identity verification and emergency-contact ciphertext).

Location is purpose-bound and time-scoped. Safety exact coordinates are only
available to the safety role after an audited elevated action; customer/courier
responses receive the minimum needed for the active order. Provider tokens are
opaque references, not PAN. Logs and analytics use correlation IDs and
allow-listed event fields; email, phone, access tokens, payment data and raw
evidence are redacted or excluded.

Retention, residency, deletion/export, legal hold, and access review are
market-configured. Safety and financial records use immutable originals and
compensating records. PCI scope remains with tokenized/hosted provider fields;
real vendor attestations are a release follow-up once a vendor is selected.
