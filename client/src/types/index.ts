// ─── Auth ─────────────────────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'manager' | 'cashier' | 'inventory_staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  is_active?: boolean;
  created_at?: string;
}

// ─── Products ─────────────────────────────────────────────────────────────────
export type ProductType = 'rental' | 'sale' | 'both';

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parent_id?: string;
  sort_order: number;
  product_count?: number;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  size?: string;
  color?: string;
  material?: string;
  selling_price?: number;
  rental_price_per_day?: number;
  stock_quantity: number;
  available_for_rent: number;
  damaged_count?: number;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  sku: string;
  barcode?: string;
  type: ProductType;
  selling_price?: number;
  rental_price_per_day?: number;
  late_fine_per_day?: number;
  is_active: boolean;
  primary_image?: string;
  variant_count?: number;
  total_stock?: number;
  total_available?: number;
  variants?: ProductVariant[];
  images?: ProductImage[];
  created_at: string;
}

// ─── Customers ────────────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  notes?: string;
  total_rentals?: number;
  active_rentals?: number;
  outstanding_fines?: number;
  created_at: string;
}

// ─── Rentals ──────────────────────────────────────────────────────────────────
export type RentalStatus = 'reserved' | 'ready_for_pickup' | 'picked_up' | 'returned' | 'late_return' | 'completed' | 'cancelled';

export interface RentalItem {
  id: string;
  rental_id: string;
  product_variant_id: string;
  product_name: string;
  variant_sku: string;
  size?: string;
  color?: string;
  material?: string;
  product_image?: string;
  quantity: number;
  rental_price_per_day: number;
  is_returned: boolean;
  return_condition?: 'good' | 'damaged' | 'lost';
  returned_at?: string;
}

export interface Rental {
  id: string;
  booking_number: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_whatsapp?: string;
  customer_email?: string;
  status: RentalStatus;
  rental_start_date: string;
  rental_end_date: string;
  actual_return_date?: string;
  advance_payment: number;
  total_rental_cost: number;
  total_fine: number;
  discount_amount: number;
  notes?: string;
  event_type?: string;
  item_count?: number;
  created_by_name?: string;
  items?: RentalItem[];
  payments?: Payment[];
  fines?: FineTransaction[];
  notifications?: NotificationLog[];
  created_at: string;
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'card' | 'mobile_payment' | 'bank_transfer' | 'mixed';

export interface SaleItem {
  id: string;
  sale_id: string;
  product_variant_id: string;
  product_name: string;
  variant_info?: string;
  quantity: number;
  unit_price: number;
  discount: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  sale_number: string;
  customer_id?: string;
  customer_name?: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  change_amount: number;
  payment_method: PaymentMethod;
  status: string;
  notes?: string;
  cashier_name?: string;
  items?: SaleItem[];
  created_at: string;
}

// ─── POS Cart ────────────────────────────────────────────────────────────────
export interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  variantSku: string;
  size?: string;
  color?: string;
  image?: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  subtotal: number;
  isRental?: boolean;
  rentalPricePerDay?: number;
}

// ─── Payments ─────────────────────────────────────────────────────────────────
export type PaymentType = 'advance' | 'balance' | 'fine' | 'refund' | 'full';

export interface Payment {
  id: string;
  rental_id?: string;
  sale_id?: string;
  booking_number?: string;
  sale_number?: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_type: PaymentType;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

// ─── Fines ────────────────────────────────────────────────────────────────────
export interface FineTransaction {
  id: string;
  rental_id: string;
  booking_number?: string;
  days_late: number;
  fine_per_day: number;
  total_fine: number;
  is_paid: boolean;
  paid_at?: string;
  created_at: string;
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export type MovementType = 'in' | 'out' | 'return' | 'damage' | 'adjustment' | 'rental_out' | 'rental_return';

export interface InventoryVariant extends ProductVariant {
  product_name: string;
  product_sku: string;
  product_type: ProductType;
  category_name?: string;
  product_image?: string;
  sold_count?: number;
}

export interface InventoryMovement {
  id: string;
  product_variant_id: string;
  product_name?: string;
  variant_sku?: string;
  size?: string;
  color?: string;
  type: MovementType;
  quantity: number;
  reason?: string;
  reference_id?: string;
  reference_type?: string;
  created_by_name?: string;
  created_at: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────
export interface NotificationLog {
  id: string;
  rental_id?: string;
  customer_id?: string;
  customer_name?: string;
  booking_number?: string;
  type: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'system';
  recipient?: string;
  message: string;
  status: 'pending' | 'sent' | 'failed';
  error_message?: string;
  sent_at?: string;
  created_at: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  todayRevenue: number;
  todaySalesCount: number;
  monthRevenue: number;
  activeRentals: number;
  pendingReturns: number;
  lowStockCount: number;
  recentBookings: Rental[];
  upcomingReturns: Rental[];
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export interface Setting {
  value: string;
  category: string;
  label: string;
}

export type Settings = Record<string, Setting>;

// ─── Promotions ───────────────────────────────────────────────────────────────
export type PromotionType = 'percentage' | 'flat_amount' | 'buy_x_get_y' | 'free_item';
export type PromotionScope = 'pos' | 'rental' | 'both';

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  type: PromotionType;
  scope: PromotionScope;
  percentage_value?: number;
  flat_amount_value?: number;
  buy_quantity?: number;
  get_quantity?: number;
  free_variant_id?: string;
  free_product_name?: string;
  free_variant_sku?: string;
  free_variant_size?: string;
  free_variant_color?: string;
  free_variant_selling_price?: number;
  free_variant_rental_price_per_day?: number;
  min_order_amount?: number;
  max_usage_count?: number;
  usage_count: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_by_name?: string;
  created_at: string;
}
