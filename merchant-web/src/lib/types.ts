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
  operating_state_until?: string | null
  operating_state_version?: number
  operating_timezone?: string
  auto_accept_orders?: boolean
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

export interface MerchantSearchResult {
  kind: 'menu' | 'order' | 'staff' | 'outlet' | string
  id: string
  title: string
  subtitle?: string
  path: string
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
  items: FoodOrderItem[]
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
