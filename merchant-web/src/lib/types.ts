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
  user?: AuthUser
}

export interface Merchant {
  id: string
  user_id: string
  nama_toko: string
  alamat: string
  lokasi_lat?: number | null
  lokasi_lng?: number | null
  jam_buka?: string | null
  jam_tutup?: string | null
  is_open: boolean
  min_order_idr?: number
  paused_until?: string | null
  completion_rate_pct?: number
  verification_status: 'pending' | 'approved' | 'rejected'
  avg_rating?: number
  rating_count?: number
  business_type?: string
  created_at?: string
  updated_at?: string
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
