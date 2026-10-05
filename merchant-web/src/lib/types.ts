export interface AuthUser {
  id?: string
  name?: string
  full_name?: string
  email?: string
}

export interface AuthResponse {
  success?: boolean
  message?: string
  access_token?: string
  refresh_token?: string
  require_otp?: boolean
  otp_reason?: 'registration' | 'new_device' | string
  require_2fa?: boolean
  mfa_user_id?: string
  user?: AuthUser
  data?: {
    token?: string
  }
}

export type MerchantOnboardingStatus = 'DRAFT' | 'SUBMITTED' | 'VERIFYING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'

export interface MerchantBranch {
  id: string
  merchant_id: string
  code: string
  name: string
  address: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface Merchant {
  id: string
  user_id: string
  nama_toko: string
  alamat: string
  branch_id?: string
  branch_code?: string
  outlet_name?: string
  branch_address?: string
  lokasi_lat?: number | null
  lokasi_lng?: number | null
  jam_buka?: string | null
  jam_tutup?: string | null
  is_open: boolean
  min_order_idr?: number
  paused_until?: string | null
  completion_rate_pct?: number
  verification_status: 'pending' | 'approved' | 'rejected'
  onboarding_status?: MerchantOnboardingStatus | string
  market_code?: string
  operating_state?: 'open' | 'closed' | 'busy' | 'paused' | 'temp_closed' | 'holiday' | string
  operating_state_reason?: string | null
  operating_state_source?: string | null
  operating_state_until?: string | null
  operating_state_updated_by?: string | null
  operating_state_updated_by_name?: string | null
  operating_state_version?: number
  operating_timezone?: string
  busy_until?: string | null
  busy_extra_prep_minutes?: number
  auto_accept_orders?: boolean
  bank_name?: string | null
  bank_account_number?: string | null
  bank_account_holder?: string | null
  bank_account_verified?: boolean
  bank_account_cooldown_until?: string | null
  avg_rating?: number
  rating_count?: number
  business_type?: string
  created_at?: string
  updated_at?: string
}

export interface MerchantPortalContext {
  merchant: Merchant
  business_id: string
  branches: MerchantBranch[]
  current_branch_id?: string
  effective_role: string
  granted_permissions: number
  capabilities: string[]
  device_session_required: boolean
  financial_context: {
    market_code: string
    currency_code: string
    currency_minor_unit: number
    timezone: string
    display_locale: string
  }
}

export interface MerchantNotification {
  id: string
  title: string
  body: string
  is_read: boolean
  deep_link?: string | null
  created_at: string
}

export type MerchantSupportCaseStatus =
  | 'open'
  | 'investigating'
  | 'pending_customer'
  | 'pending_internal'
  | 'resolved'
  | 'closed'
  | string

export interface MerchantSupportCaseLink {
  id?: string
  reference_type: string
  reference_id: string
  reference_label?: string | null
  created_at?: string
}

export interface MerchantSupportCaseEvent {
  id: string
  event_type: string
  from_status?: string | null
  to_status?: string | null
  actor_id?: string | null
  actor_role?: string | null
  note?: string | null
  created_at: string
}

export interface MerchantSupportCase {
  id: string
  case_number: string
  requester_role: string
  category: string
  subject: string
  description: string
  service_code: string
  market_code: string
  priority: 'low' | 'normal' | 'high' | 'urgent' | string
  status: MerchantSupportCaseStatus
  assigned_to?: string | null
  assigned_to_name?: string | null
  escalation_level: number
  sla_due_at: string
  sla_breached?: boolean
  resolved_at?: string | null
  reopened_at?: string | null
  reopen_count: number
  created_at: string
  updated_at: string
  links?: MerchantSupportCaseLink[]
  events?: MerchantSupportCaseEvent[]
  actions?: Array<{ id: string; action_type: string; status: string; amount_idr?: number | null; created_at: string }>
  authoritative?: {
    order_id?: string | null
    order_status?: string | null
    payment_status?: string | null
  }
}

export interface MerchantSupportCaseListResponse {
  success?: boolean
  data: MerchantSupportCase[]
  total: number
  limit: number
  offset: number
}

export interface MerchantSearchResult {
  kind: 'menu' | 'order' | 'staff' | 'outlet' | string
  id: string
  title: string
  subtitle?: string
  path: string
}

export interface MerchantPOSConnectorStatus {
  provider_code: string
  provider_name: string
  branch_id?: string
  enabled: boolean
  state: string
  capabilities: string[]
  last_checked_at?: string
  last_latency_ms?: number
  consecutive_failures: number
  availability_reason?: string
  open_reconciliation: number
  failed_order_deliveries: number
  pending_order_deliveries: number
}

export interface MerchantPOSIntegrationStatus {
  merchant_id: string
  canonical_owner: string
  catalog_ownership: string
  inventory_ownership: string
  customer_acceptance_rule: string
  connectors: MerchantPOSConnectorStatus[]
}

export interface MenuItem {
  id: string
  merchant_id: string
  nama: string
  harga: number
  foto?: string | null
  kategori: string
  prep_time_minutes?: number
  is_available: boolean
  created_at?: string
  updated_at?: string
}

export interface MenuItemRequest {
  nama: string
  harga: number
  foto?: string | null
  kategori: string
  prep_time_minutes: number
  is_available?: boolean | null
}

export interface MenuListResponse {
  items: MenuItem[]
  total: number
  page: number
  page_size: number
}

export interface CatalogReadiness {
  ready: boolean
  catalog_version: number
  published_version?: number | null
  published_catalog_version?: number | null
  item_count: number
  blocking_reasons?: string[]
}

export interface CatalogPublication {
  id: string
  merchant_id: string
  publication_version: number
  catalog_version: number
  item_count: number
  created_at: string
  source_publication_id?: string | null
}

export interface MerchantReviewReply {
  id: string
  body: string
  created_at: string
  updated_at: string
}

export interface MerchantReview {
  id: string
  order_number?: string
  reviewer_name: string
  stars: number
  comment?: string
  tags?: string[]
  created_at: string
  reply?: MerchantReviewReply | null
}

export interface MerchantRatingBucket {
  stars: number
  count: number
}

export interface MerchantReviewsResponse {
  avg_rating: number
  rating_count: number
  reviews: MerchantReview[]
  rating_distribution: MerchantRatingBucket[]
  page: number
  page_size: number
}

export interface MerchantSubstitutionProposal {
  id: string
  order_id: string
  original_menu_item_id: string
  original_item_name: string
  replacement_menu_item_id: string
  replacement_item_name: string
  original_price_idr: number
  replacement_price_idr: number
  price_difference_idr: number
  reason?: string
  proposed_at: string
  customer_decision: string
  customer_decided_at?: string | null
}

export interface MenuItemVariantOption {
  id: string
  variant_id: string
  nama: string
  price_delta: number
  is_default: boolean
}

export interface MenuItemVariant {
  id: string
  menu_item_id: string
  nama: string
  is_required: boolean
  min_select: number
  max_select: number
  options: MenuItemVariantOption[]
}

export interface VariantOptionRequest {
  nama: string
  price_delta: number
}

export interface VariantGroupRequest {
  nama: string
  is_required: boolean
  min_select: number
  max_select: number
  options: VariantOptionRequest[]
}

export interface ReplaceVariantsRequest {
  variants: VariantGroupRequest[]
}

export interface FoodOrderItemVariant {
  variant_name: string
  option_name: string
  price_delta: number
}

export interface FoodOrderItem {
  menu_item_id: string
  item_name: string
  quantity: number
  item_price: number
  subtotal: number
  notes?: string | null
  variants?: FoodOrderItemVariant[]
}

export interface MerchantOrder {
  id: string
  order_number: string
  status: string
  customer_name?: string | null
  customer_phone?: string | null
  dropoff_address?: string | null
  total_price_idr: number
  distance_km?: number
  merchant_accepted_at?: string | null
  food_ready_at?: string | null
  created_at?: string | null
  order_notes?: string | null
  scheduled_at?: string | null
  payment_status?: string | null
  payment_method?: string | null
  items: FoodOrderItem[]
}

export interface MerchantOrderTimelineEvent {
  id: string
  event_type: string
  description?: string
  actor_role?: string
  from_status?: string
  to_status?: string
  reason?: string
  version: number
  created_at: string
}

export interface MerchantOrderDetail extends MerchantOrder {
  state_version: number
  courier?: {
    id?: string
    name?: string
    phone?: string
    status?: string
    assigned_at?: string
    picked_up_at?: string
  }
  financials: {
    subtotal_idr: number
    delivery_fee_idr: number
    platform_fee_idr: number
    merchant_promo_discount_idr: number
    refunded_idr: number
    net_merchant_idr: number
  }
  timeline: MerchantOrderTimelineEvent[]
  substitutions?: MerchantSubstitutionProposal[]
  data_as_of: string
}

export interface MerchantSubstitutionProposal {
  id: string
  original_menu_item_id: string
  original_item_name: string
  original_price_idr: number
  replacement_menu_item_id: string
  replacement_item_name: string
  replacement_price_idr: number
  price_difference_idr: number
  reason?: string
  proposed_by_role: string
  proposed_at: string
  customer_decision: 'pending' | 'approved' | 'rejected' | string
  customer_decided_at?: string | null
}

export interface MerchantStruk {
  order_id: string
  order_number: string
  status: string
  merchant_name: string
  merchant_address?: string
  customer_name?: string
  dropoff_address?: string
  subtotal_idr: number
  delivery_fee_idr: number
  total_price_idr: number
  created_at: string
  items: FoodOrderItem[]
}

export interface OrderListResponse {
  orders: MerchantOrder[]
  total: number
  page: number
  page_size: number
}

export interface SalesReportSummary {
  period: string
  total_orders: number
  gmv_idr: number
  avg_order_value_idr: number
  top_items?: { item_name: string; quantity: number; revenue_idr: number }[]
  daily_breakdown?: { day: string; revenue_idr: number }[]
  performance?: {
    total_received: number
    accepted: number
    cancelled: number
    rejected_by_merchant: number
    acceptance_rate_pct: number
    cancellation_rate_pct: number
    avg_rating: number
    rating_count: number
  }
  advanced?: {
    repeat_customer_count: number
    repeat_customer_rate_pct: number
    peak_order_hour?: number
    avg_accepted_ready_minutes?: number
  }
}

export interface MerchantDashboardReadiness {
  outlet_ready: boolean
  menu_ready: boolean
  notifications_ready: boolean
  ready: boolean
  blocking_reasons: string[]
  checked_at: string
}

export interface MerchantFinanceStatement {
  entries: MerchantStatementEntry[]
  totals: {
    market_code: string
    currency_code: string
    currency_minor_unit: number
    sales_minor: number
    commission_minor: number
    tax_minor: number
    promo_subsidy_minor: number
    refund_minor: number
    fee_minor: number
    ads_spend_minor: number
    adjustment_minor: number
    payout_minor: number
    net_balance_minor: number
  }[]
  discrepancies: MerchantSettlementDiscrepancy[]
  scope_level: string
  branch_id?: string
  scope_note?: string
  held_payout_count: number
  held_payout_minor: number
  next_payout_at?: string | null
  generated_at: string
}

export interface MerchantStatementEntry {
  id: string
  entry_type: string
  direction: string
  amount_minor: number
  signed_amount_minor: number
  source_type: string
  source_id: string
  status?: string
  occurred_at: string
  description: string
}

export interface MerchantSettlementDiscrepancy {
  id: string
  reference_type: string
  reference_id: string
  expected_minor: number
  actual_minor: number
  difference_minor: number
  reason: string
  status: string
  first_seen_at: string
  last_seen_at: string
}

export interface MerchantDashboard {
  merchant: Merchant
  scope: {
    level: string
    merchant_id: string
    selected_branch_id?: string
    branch_count: number
    branch_scoped: boolean
    note?: string
  }
  operating_hours?: {
    hours: Array<{ weekday: number; is_open: boolean; opens_at?: string | null; closes_at?: string | null; last_order_minutes_before_close: number }>
    closures: Array<{ id: string; closure_date: string; label: string }>
  }
  orders: {
    new: number
    needs_action: number
    preparing: number
    ready_for_pickup: number
    waiting_courier: number
    in_progress: number
    delivering: number
    completed: number
    cancelled: number
    refund_dispute: number
    sla_overdue: number
    sync_errors: number
    rejected: number
  }
  recent_orders: MerchantOrder[]
  sales?: SalesReportSummary
  finance?: MerchantFinanceStatement
  auto_accept: MerchantDashboardReadiness
  alerts: {
    code: string
    severity: string
    title: string
    description: string
    action_path?: string
  }[]
  warnings: string[]
  data_as_of: string
}

export interface MerchantPromo {
  id: string
  menu_item_id?: string | null
  discount_type: 'percent' | 'fixed' | 'buy1get1'
  discount_value: number
  max_discount_idr?: number | null
  starts_at: string
  ends_at: string
  is_active: boolean
}

export interface SettlementRecord {
  id: string
  order_id?: string
  net_payout_idr: number
  merchant_fee_idr: number
  promo_discount_idr?: number
  status: string
  settled_at?: string | null
  created_at: string
}

export interface SettlementSummary {
  total_idr: number
  holding_idr: number
  available_idr: number
  records: SettlementRecord[]
  tax?: {
    taxable_sales_idr: number
    ppn_idr: number
    invoice_required: number
    invoice_issued: number
  }
}

export interface WithdrawalRecord {
  id: string
  amount_idr: number
  bank_name: string
  bank_account_number: string
  bank_account_holder: string
  status: string
  rejection_reason?: string | null
  created_at: string
}

export interface MerchantStaff {
  id: string
  role: 'manager' | 'kasir' | 'kitchen' | string
  status: 'pending' | 'active' | 'revoked' | string
  permissions: number
  branch_ids?: string[]
  staff_name?: string | null
  staff_email?: string | null
  invited_at: string
}

export const REJECT_REASONS = [
  { value: 'stok_habis', label: 'Stok menu habis' },
  { value: 'terlalu_sibuk', label: 'Terlalu sibuk' },
  { value: 'tutup_mendadak', label: 'Tutup mendadak' },
  { value: 'lainnya', label: 'Lainnya' },
] as const

export type RejectReason = (typeof REJECT_REASONS)[number]['value']

export const ACTIVE_ORDER_STATUSES = [
  'preparing',
  'searching',
  'accepted',
  'picking_up',
  'picked_up',
  'delivering',
] as const

export const rupiah = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v || 0)
