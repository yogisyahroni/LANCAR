// ===================================================================
// Barrel Export: src/controllers/index.ts
// Consolidates all domain controllers into a single import surface.
// ===================================================================

// Admin Users
export * from './admin.controller';

// Orders
export * from './orders.controller';

// Couriers
export * from './couriers.controller';

// Finance (Payouts, Revenue, Emergency Fund)
export * from './finance.controller';

// Customers
export * from './customers.controller';

// Disputes
export * from './disputes.controller';

// Analytics (Dashboard Stats, KPIs, SLA Charts, Reports)
export * from './analytics.controller';

// Notifications (Templates)
export * from './notifications.controller';

// Vouchers
export * from './vouchers.controller';

// Logistics (Zones, Pricing, SLA Configs)
export * from './logistics.controller';

// Feature Flags & Audit Logs
export * from './flags.controller';

// System (Health, Configs, Readiness)
export * from './system.controller';

// Customer Web Portal Auth
export * from './customerAuth.controller';

// Wallet
export * from './wallet.controller';

// Customer Web Portal Orders
export * as customerOrder from './customerOrder.controller';
export * as bulkOrder from './bulkOrder.controller';
export * from './userNotifications.controller';
export * from './warehouse.controller';
