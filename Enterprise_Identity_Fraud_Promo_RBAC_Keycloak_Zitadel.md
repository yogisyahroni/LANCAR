# Enterprise Identity Platform PRD
## Focus: Identity + Fraud + Promo Abuse + RBAC + Keycloak/Zitadel

Version: 1.0

---

# 1. Executive Summary

Dokumen ini mendefinisikan arsitektur enterprise untuk platform identitas yang mendukung:
- Customer
- Driver
- Agent
- Merchant
- Admin
- Finance
- Operations

Tujuan utama:
- Single Master Identity
- Social Login
- Phone OTP
- RBAC Enterprise
- Fraud Detection
- Promo Abuse Prevention
- Keycloak/Zitadel Ready
- Multi Region Ready

---

# 2. Architecture Principles

1. Internal User ID adalah sumber kebenaran.
2. Email bukan identitas utama.
3. Provider OAuth bukan identitas utama.
4. Semua service hanya mengenal Internal User ID.
5. Promo mengacu ke Master Identity.
6. Semua aktivitas diaudit.

---

# 3. C4 Context Model

```text
Customers
Drivers
Agents
Admins
    |
    v
Identity Platform
    |
    +--> Order Service
    +--> Finance Service
    +--> Tracking Service
    +--> Promo Service
```

# 4. C4 Container Model

```text
Keycloak/Zitadel
Identity API
Fraud Engine
Promo Engine
OTP Service
Audit Service
PostgreSQL
Redis
Kafka
```

# 5. Identity Domain Model

Master Identity
Linked Identities
Sessions
Devices
Roles
Permissions

# 6. Keycloak Architecture

Realm Strategy
Client Strategy
Role Mapping
Protocol Mapper
Federation
Social Login

# 7. Zitadel Architecture

Organizations
Projects
Applications
Human Users
Machine Users

# 8. Authentication Flows

Google OAuth
Apple Sign In
Microsoft OAuth
GitHub OAuth
Phone OTP

# 9. Account Linking Strategy

Manual Linking
Verified Phone Linking
Identity Verification

# 10. JWT Standard

Claims:
- sub
- role
- tenant
- permissions
- phone_verified

# 11. RBAC Model

Roles:
- Customer
- Driver
- Agent
- Merchant
- Admin
- Finance
- Ops
- Super Admin

# 12. Permission Matrix

Create Orders
View Orders
Manage Drivers
Manage Finance
Manage Promotions
Manage Users
Manage Roles

# 13. Fraud Prevention Overview

Signals:
- Device
- Phone
- Payment
- IP
- Geo
- Velocity

# 14. Fraud Risk Scoring

LOW
MEDIUM
HIGH
CRITICAL

# 15. Promo Abuse Prevention

Rule:
One promo per master identity.

# 16. Referral Abuse Prevention

Device Correlation
Phone Correlation
Payment Correlation

# 17. Device Fingerprinting

Android ID
iOS Vendor ID
Browser Fingerprint

# 18. Payment Fingerprinting

Card Hash
Wallet Hash
VA Correlation

# 19. IP Intelligence

ASN
VPN Detection
Proxy Detection

# 20. Geo Intelligence

Country
Region
City
Impossible Travel

# 21. Database Design

Core Tables:
users
user_identities
roles
permissions
user_roles
sessions
devices
risk_scores
promo_redemptions
audit_logs

# 22. Extended ERD

50+ table recommendation:
identity_*
fraud_*
promo_*
audit_*
rbac_*

# 23. DBML Guidelines

Compatible with dbdiagram.io

# 24. Kafka Event Catalog

identity.user.created
identity.user.updated
identity.user.linked
identity.user.deleted
fraud.risk.updated
promo.redeemed

# 25. OpenAPI Standards

OAuth endpoints
OTP endpoints
User endpoints
Role endpoints

# 26. Audit Logging

Login
Logout
Failed Login
Role Change
Promo Redemption

# 27. Security Requirements

OIDC
OAuth2
PKCE
HTTPS
MFA
Token Revocation

# 28. Threat Model (STRIDE)

Spoofing
Tampering
Repudiation
Information Disclosure
Denial of Service
Elevation of Privilege

# 29. Kubernetes Deployment

Ingress
Identity Pods
Fraud Pods
Redis
Kafka
PostgreSQL

# 30. Multi Region Strategy

Active Passive
Cross Region Replication

# 31. Disaster Recovery

RPO: 15 Minutes
RTO: 1 Hour

# 32. Observability

Prometheus
Grafana
OpenTelemetry
Loki
Tempo

# 33. Capacity Planning

1M Users
10M Users
50M Users

# 34. FinOps

Cost Allocation
Capacity Forecasting
Reserved Capacity

# 35. Migration Roadmap

Year 1:
Identity Foundation

Year 2:
Fraud Intelligence

Year 3:
Advanced Risk Engine

# Appendix

Recommended Stack:
- Keycloak or Zitadel
- PostgreSQL
- Redis
- Kafka
- Kubernetes
- OpenTelemetry
- Prometheus
- Grafana
