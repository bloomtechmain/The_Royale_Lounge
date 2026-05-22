import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Barcode, ShoppingCart, Plus, Minus, Trash2,
  Package, X, Printer, CheckCircle, Tag, User,
  Banknote, CreditCard, Smartphone, Building2, ChevronLeft,
  StickyNote, MessageCircle, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import { productService } from '@/services/productService';
import { posService } from '@/services/posService';
import { customerService } from '@/services/customerService';
import { calculatePromoDiscount } from '@/services/promotionService';
import { useCartStore } from '@/store/cartStore';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Drawer from '@/components/common/Drawer';
import PromotionSelector from '@/components/common/PromotionSelector';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import type { ProductCategory, Promotion } from '@/types';

const PAYMENT_METHODS = [
  { value: 'cash',           label: 'Cash',         icon: Banknote   },
  { value: 'card',           label: 'Card',         icon: CreditCard },
  { value: 'mobile_payment', label: 'Mobile Pay',   icon: Smartphone },
  { value: 'bank_transfer',  label: 'Bank Transfer', icon: Building2  },
] as const;

export default function POSPage() {
  const qc = useQueryClient();
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');
  const [cartStep, setCartStep] = useState<'cart' | 'payment'>('cart');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [extraDiscount, setExtraDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [variantPickerProduct, setVariantPickerProduct] = useState<any | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<'whatsapp' | 'sms' | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const {
    items: cartItems, addItem, removeItem, updateQuantity, updateDiscount,
    clearCart, getSubtotal, discountAmount, setCartDiscount,
    customerId, customerName, setCustomer,
  } = useCartStore();

  const { data: categories } = useQuery({
    queryKey: ['product-categories'],
    queryFn: productService.getCategories,
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['pos-products', productSearch, categoryFilter],
    queryFn: () => productService.getAll({
      search: productSearch || undefined,
      category: categoryFilter || undefined,
      active: true,
      includeVariants: true,
      limit: 50,
    }),
  });

  const { data: customerResults } = useQuery({
    queryKey: ['customer-search-pos', customerSearch],
    queryFn: () => customerService.search(customerSearch),
    enabled: customerSearch.length > 1,
  });

  const checkoutMutation = useMutation({
    mutationFn: posService.checkout,
    onSuccess: (data) => {
      setReceipt(data.receipt);
      setShowReceipt(true);
      clearCart();
      setCustomer(null, null);
      setSelectedPromotion(null);
      setPaymentMethod('cash');
      setAmountPaid('');
      setExtraDiscount('');
      setNotes('');
      setShowNotes(false);
      setCartStep('cart');
      setMobileTab('products');
      qc.invalidateQueries({ queryKey: ['pos-products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['revenue-chart'] });
      toast.success(`Sale ${data.sale.sale_number} completed!`);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Checkout failed'),
  });

  const handleBarcodeInput = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const barcode = (e.target as HTMLInputElement).value.trim();
    if (!barcode) return;
    try {
      const result = await productService.getByBarcode(barcode);
      if (result.type === 'variant') {
        addItem({
          variantId: result.id, productId: result.product_id,
          productName: result.product_name, variantSku: result.sku,
          size: result.size, color: result.color,
          unitPrice: parseFloat(result.selling_price || 0),
          quantity: 1, discount: 0, subtotal: parseFloat(result.selling_price || 0),
        });
        toast.success(`Added: ${result.product_name} ${result.size || ''}`);
      } else if (result.variants?.length === 1) {
        const v = result.variants[0];
        addItem({
          variantId: v.id, productId: result.id,
          productName: result.name, variantSku: v.sku,
          size: v.size, color: v.color,
          unitPrice: parseFloat(v.selling_price || result.selling_price || 0),
          quantity: 1, discount: 0, subtotal: parseFloat(v.selling_price || result.selling_price || 0),
        });
        toast.success(`Added: ${result.name}`);
      }
      (e.target as HTMLInputElement).value = '';
    } catch {
      toast.error('Product not found');
    }
  };

  const handleAddProduct = (product: any, variant: any) => {
    addItem({
      variantId: variant.id, productId: product.id,
      productName: product.name, variantSku: variant.sku,
      size: variant.size, color: variant.color,
      image: product.primary_image,
      unitPrice: parseFloat(variant.selling_price || product.selling_price || 0),
      quantity: 1, discount: 0,
      subtotal: parseFloat(variant.selling_price || product.selling_price || 0),
    });
    setVariantPickerProduct(null);
  };

  const handleProductCardClick = (product: any) => {
    const saleQty = (v: any) => Math.max(0, (v.stock_quantity || 0) - (v.available_for_rent || 0));
    const saleVariants = (product.variants || []).filter((v: any) => saleQty(v) > 0);
    if (saleVariants.length === 1) handleAddProduct(product, saleVariants[0]);
    else if (saleVariants.length > 1) setVariantPickerProduct(product);
  };

  const subtotal = getSubtotal();
  const discount = parseFloat(extraDiscount || '0');
  const promoDiscount = selectedPromotion
    ? calculatePromoDiscount(
        selectedPromotion, subtotal,
        cartItems.map(i => ({ unitPrice: i.unitPrice, quantity: i.quantity })),
        1, 'pos'
      )
    : 0;
  const total = Math.max(0, subtotal - discount - discountAmount - promoDiscount);
  const isCash = paymentMethod === 'cash';
  const paidAmount = isCash ? parseFloat(amountPaid || String(total)) : total;
  const change = Math.max(0, paidAmount - total);

  const handleSendInvoice = async (channel: 'whatsapp' | 'sms') => {
    if (!receipt?.saleId) return;
    setSendingInvoice(channel);
    try {
      const res = await api.post('/notifications/send-invoice', {
        type: 'pos', referenceId: receipt.saleId, channel,
      });
      if (res.data.waLink) {
        window.open(res.data.waLink, '_blank');
      } else {
        toast.success('Invoice sent via SMS!');
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to send invoice');
    } finally {
      setSendingInvoice(null);
    }
  };

  const handleCheckout = () => {
    checkoutMutation.mutate({
      customerId: customerId || undefined,
      items: cartItems.map((item) => ({
        variantId: item.variantId, quantity: item.quantity,
        unitPrice: item.unitPrice, discount: item.discount,
      })),
      discountAmount: discount + discountAmount,
      promotionId: selectedPromotion?.id ?? null,
      paymentMethod,
      amountPaid: paidAmount,
      notes,
    });
  };

  const categoryOptions = [
    { value: '', label: 'All' },
    ...(categories || []).map((c: ProductCategory) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] -mx-4 lg:-mx-6 -my-4 lg:-my-6 overflow-hidden">

      {/* ─── Left: Products ─── */}
      <div className={cn(
        'flex-1 flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-charcoal-500',
        mobileTab === 'products' ? 'flex' : 'hidden lg:flex'
      )}>
        {/* Search + category bar */}
        <div className="p-4 border-b border-charcoal-500 bg-charcoal-800 space-y-3 flex-shrink-0">
          <div className="flex gap-2">
            <Input
              ref={barcodeRef}
              placeholder="Scan barcode..."
              icon={<Barcode size={15} />}
              className="flex-1"
              onKeyDown={handleBarcodeInput}
            />
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products..."
              icon={<Search size={15} />}
              className="flex-1"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCategoryFilter(opt.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                  categoryFilter === opt.value
                    ? 'bg-gold-gradient text-charcoal-900'
                    : 'bg-charcoal-600 text-charcoal-200 hover:bg-charcoal-500 hover:text-charcoal-50'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4 pb-20 lg:pb-4">
          {productsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-charcoal-600 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !products?.data?.length ? (
            <div className="flex flex-col items-center justify-center h-full text-charcoal-200">
              <Package size={48} className="mb-3 opacity-30" />
              <p>No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {products.data.map((product: any) => {
                const variants: any[] = product.variants || [];
                if (variants.length === 0) return null;
                const saleQty = (v: any) => Math.max(0, (v.stock_quantity || 0) - (v.available_for_rent || 0));
                const totalSaleStock = variants.reduce((s: number, v: any) => s + saleQty(v), 0);
                const inStock = totalSaleStock > 0;
                const saleVariants = variants.filter((v: any) => saleQty(v) > 0);
                const lowestPrice = Math.min(...(saleVariants.length ? saleVariants : variants).map((v: any) => parseFloat(v.selling_price || product.selling_price || 0)));
                const multipleVariants = variants.length > 1;
                return (
                  <motion.button
                    key={product.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => inStock && handleProductCardClick(product)}
                    disabled={!inStock}
                    className={cn(
                      'relative bg-charcoal-700 border border-charcoal-500 rounded-xl overflow-hidden text-left transition-all duration-200',
                      inStock
                        ? 'hover:border-gold-700/40 hover:shadow-gold cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="aspect-square bg-charcoal-600 flex items-center justify-center overflow-hidden">
                      {product.primary_image
                        ? <img src={product.primary_image} alt={product.name} className="w-full h-full object-cover" />
                        : <Package size={24} className="text-charcoal-300" />}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-medium text-charcoal-50 leading-tight truncate">{product.name}</p>
                      {multipleVariants
                        ? <p className="text-xs text-gold-500/80 mt-0.5">{variants.length} sizes available</p>
                        : variants[0].size && <p className="text-xs text-charcoal-200 mt-0.5">Size: {variants[0].size}</p>}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-sm font-semibold text-gold-400">
                          {multipleVariants ? 'From ' : ''}{formatCurrency(lowestPrice)}
                        </span>
                        <span className={cn('text-xs', inStock ? 'text-charcoal-200' : 'text-red-400')}>
                          {totalSaleStock} left
                        </span>
                      </div>
                    </div>
                    {!inStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-charcoal-900/60 rounded-xl">
                        <span className="text-xs text-red-400 font-medium">Out of Stock</span>
                      </div>
                    )}
                    {multipleVariants && inStock && (
                      <div className="absolute top-1.5 right-1.5 bg-charcoal-900/70 text-gold-400 text-xs px-1.5 py-0.5 rounded-md font-medium">
                        Pick size
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile: sticky cart bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 bg-charcoal-900/95 backdrop-blur border-t border-charcoal-500 z-10">
          <button
            onClick={() => setMobileTab('cart')}
            className="w-full flex items-center justify-between px-4 py-3 bg-gold-gradient rounded-xl text-charcoal-900 font-semibold text-sm"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart size={16} />
              View Cart
              {cartItems.length > 0 && (
                <span className="bg-charcoal-900/30 text-charcoal-900 text-xs font-bold px-2 py-0.5 rounded-full">
                  {cartItems.length}
                </span>
              )}
            </span>
            <span>{formatCurrency(total)}</span>
          </button>
        </div>
      </div>

      {/* ─── Right: Cart / Payment (two-step) ─── */}
      <div className={cn(
        'w-full lg:w-[22rem] xl:w-[26rem] flex-col bg-charcoal-800 flex-shrink-0 overflow-hidden',
        mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
      )}>

        {/* ── Step indicator ── */}
        <div className="flex-shrink-0 border-b border-charcoal-500 px-4 py-2.5 flex items-center gap-0">
          {(['cart', 'payment'] as const).map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className={cn(
                'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 transition-all',
                cartStep === s
                  ? 'bg-gold-600 text-charcoal-900'
                  : i === 0 && cartStep === 'payment'
                    ? 'bg-charcoal-500 text-charcoal-300'
                    : 'bg-charcoal-600 border border-charcoal-500 text-charcoal-400'
              )}>
                {i === 0 && cartStep === 'payment' ? <CheckCircle size={12} /> : i + 1}
              </div>
              <span className={cn(
                'ml-1.5 text-xs font-medium',
                cartStep === s ? 'text-charcoal-50' : 'text-charcoal-400'
              )}>
                {s === 'cart' ? 'Cart' : 'Payment'}
              </span>
              {i === 0 && <div className={cn('flex-1 h-px mx-2', cartStep === 'payment' ? 'bg-gold-700' : 'bg-charcoal-600')} />}
            </div>
          ))}
          {/* Mobile: back to products */}
          <button
            onClick={() => { setMobileTab('products'); setCartStep('cart'); }}
            className="lg:hidden text-charcoal-300 hover:text-charcoal-50 ml-2 flex-shrink-0"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <AnimatePresence mode="wait">

          {/* ══ STEP 1: Cart ══ */}
          {cartStep === 'cart' && (
            <motion.div
              key="cart"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col flex-1 min-h-0"
            >
              {/* Customer */}
              <div className="px-4 pt-3 pb-3 border-b border-charcoal-500 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-charcoal-50 flex items-center gap-2 text-sm">
                    <ShoppingCart size={15} className="text-gold-400" />
                    Cart
                    {cartItems.length > 0 && (
                      <span className="bg-gold-600 text-charcoal-900 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {cartItems.length}
                      </span>
                    )}
                  </h3>
                  {cartItems.length > 0 && (
                    <button onClick={() => { clearCart(); setExtraDiscount(''); setSelectedPromotion(null); }} className="text-xs text-charcoal-300 hover:text-red-400 transition-colors">Clear</button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    value={customerSearch || customerName || ''}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Customer (optional)..."
                    icon={<User size={14} />}
                    className="text-sm"
                    iconRight={customerId ? <button onClick={() => { setCustomer(null, null); setCustomerSearch(''); }}><X size={14} /></button> : undefined}
                  />
                  {customerSearch.length > 1 && customerResults && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-charcoal-700 border border-charcoal-500 rounded-xl shadow-card z-20 overflow-hidden">
                      {customerResults.map((c: any) => (
                        <button key={c.id} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-charcoal-600 transition-colors"
                          onClick={() => { setCustomer(c.id, c.name); setCustomerSearch(''); }}
                        >
                          <span className="text-sm text-charcoal-50">{c.name}</span>
                          <span className="text-xs text-charcoal-200 ml-auto">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                <AnimatePresence>
                  {cartItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-charcoal-300 py-12">
                      <ShoppingCart size={40} className="mb-3 opacity-30" />
                      <p className="text-sm">Cart is empty</p>
                      <p className="text-xs mt-1 text-charcoal-400">Add products or scan a barcode</p>
                    </div>
                  ) : (
                    cartItems.map((item) => (
                      <motion.div
                        key={item.variantId}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="bg-charcoal-700 border border-charcoal-500 rounded-xl p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-9 h-9 rounded-lg bg-charcoal-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <Package size={13} className="text-charcoal-300" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-charcoal-50 truncate">{item.productName}</p>
                            {(item.size || item.color) && (
                              <p className="text-xs text-charcoal-200">{[item.size, item.color].filter(Boolean).join(' / ')}</p>
                            )}
                            <p className="text-xs text-gold-500">{formatCurrency(item.unitPrice)} each</p>
                          </div>
                          <button onClick={() => removeItem(item.variantId)} className="text-charcoal-300 hover:text-red-400 transition-colors flex-shrink-0">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1 bg-charcoal-600 rounded-lg p-1">
                            <button onClick={() => updateQuantity(item.variantId, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center text-charcoal-200 hover:text-charcoal-50">
                              <Minus size={12} />
                            </button>
                            <span className="w-7 text-center text-sm font-medium text-charcoal-50">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.variantId, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center text-charcoal-200 hover:text-charcoal-50">
                              <Plus size={12} />
                            </button>
                          </div>
                          <div className="flex items-center gap-1 flex-1">
                            <Tag size={11} className="text-charcoal-300 flex-shrink-0" />
                            <input
                              type="number"
                              value={item.discount || ''}
                              onChange={(e) => updateDiscount(item.variantId, parseFloat(e.target.value) || 0)}
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="Disc."
                              className="w-full bg-charcoal-600 border border-charcoal-400 rounded-lg px-2 py-1 text-xs text-charcoal-100 focus:ring-1 focus:ring-gold-600 focus:border-gold-600 outline-none"
                              min="0"
                            />
                          </div>
                          <span className="text-sm font-semibold text-gold-400 flex-shrink-0">{formatCurrency(item.subtotal)}</span>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {/* Cart footer */}
              {cartItems.length > 0 && (
                <div className="border-t border-charcoal-500 p-3 space-y-2.5 flex-shrink-0 bg-charcoal-800">
                  {/* Discount + promo */}
                  <div className="flex gap-2">
                    <Input
                      value={extraDiscount}
                      onChange={(e) => setExtraDiscount(e.target.value)}
                      onWheel={(e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
                      placeholder="Cart discount (LKR)"
                      icon={<Tag size={13} />}
                      type="number"
                      min="0"
                      className="text-sm flex-1"
                    />
                  </div>
                  <PromotionSelector
                    scope="pos"
                    cartSubtotal={subtotal}
                    cartItems={cartItems.map(i => ({ unitPrice: i.unitPrice, quantity: i.quantity }))}
                    selectedId={selectedPromotion?.id ?? null}
                    onSelect={setSelectedPromotion}
                  />
                  {/* Total */}
                  <div className="flex justify-between items-center pt-1 border-t border-charcoal-600">
                    <span className="text-sm text-charcoal-200">
                      {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-lg font-bold text-gold-400">{formatCurrency(total)}</span>
                  </div>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => setCartStep('payment')}
                    icon={<CreditCard size={16} />}
                  >
                    Proceed to Payment
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* ══ STEP 2: Payment ══ */}
          {cartStep === 'payment' && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col flex-1 min-h-0 overflow-y-auto"
            >
              <div className="p-4 space-y-4">

                {/* Order summary */}
                <div className="p-3 bg-charcoal-700/60 rounded-xl space-y-1.5 text-sm">
                  <p className="text-xs font-medium text-charcoal-300 uppercase tracking-wide mb-2">Order Summary</p>
                  {cartItems.map((item) => (
                    <div key={item.variantId} className="flex justify-between text-charcoal-200">
                      <span className="truncate mr-2">{item.productName} ×{item.quantity}</span>
                      <span className="flex-shrink-0">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                  <div className="pt-1.5 border-t border-charcoal-600 space-y-1">
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Item Discounts</span><span>-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Cart Discount</span><span>-{formatCurrency(discount)}</span>
                      </div>
                    )}
                    {promoDiscount > 0 && selectedPromotion && (
                      <div className="flex justify-between text-emerald-400">
                        <span className="truncate mr-2">{selectedPromotion.name}</span>
                        <span className="flex-shrink-0">-{formatCurrency(promoDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-base pt-0.5">
                      <span className="text-charcoal-50">Total</span>
                      <span className="text-gold-400">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Method Tiles */}
                <div>
                  <p className="text-sm font-medium text-charcoal-200 mb-2">Payment Method</p>
                  <div className="grid grid-cols-4 gap-2">
                    {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPaymentMethod(value)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border-2 transition-all',
                          paymentMethod === value
                            ? 'border-gold-500 bg-gold-700/20 text-gold-400'
                            : 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100'
                        )}
                      >
                        <Icon size={20} />
                        <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cash: amount paid + change */}
                {isCash && (
                  <div className="space-y-2">
                    <Input
                      label="Amount Paid (LKR)"
                      type="number"
                      step="0.01"
                      min="0"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      onWheel={(e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
                      placeholder={total.toFixed(2)}
                    />
                    {paidAmount > total && (
                      <div className="flex justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm">
                        <span className="text-charcoal-200">Change</span>
                        <span className="text-emerald-400 font-bold">{formatCurrency(change)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes toggle */}
                <button
                  onClick={() => setShowNotes(!showNotes)}
                  className="flex items-center gap-1.5 text-xs text-charcoal-300 hover:text-charcoal-100 transition-colors"
                >
                  <StickyNote size={12} />
                  {showNotes ? 'Hide notes' : 'Add notes'}
                </button>
                {showNotes && (
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Order notes..."
                    className="text-sm"
                  />
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="secondary"
                    onClick={() => setCartStep('cart')}
                    icon={<ChevronLeft size={15} />}
                    className="flex-shrink-0"
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={handleCheckout}
                    loading={checkoutMutation.isPending}
                    icon={<CheckCircle size={16} />}
                  >
                    Complete Sale
                  </Button>
                </div>

              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ─── Variant Picker ─── */}
      {createPortal(
        <AnimatePresence>
          {variantPickerProduct && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                onClick={() => setVariantPickerProduct(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'tween', duration: 0.18 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              >
                <div
                  className="pointer-events-auto bg-charcoal-800 border border-charcoal-500 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-3 p-4 border-b border-charcoal-600">
                    <div className="w-12 h-12 rounded-xl bg-charcoal-600 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {variantPickerProduct.primary_image
                        ? <img src={variantPickerProduct.primary_image} alt="" className="w-full h-full object-cover" />
                        : <Package size={20} className="text-charcoal-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-charcoal-50 truncate">{variantPickerProduct.name}</p>
                      <p className="text-xs text-charcoal-300 mt-0.5">Select a size to add to cart</p>
                    </div>
                    <button onClick={() => setVariantPickerProduct(null)} className="text-charcoal-300 hover:text-charcoal-50 transition-colors flex-shrink-0">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                    {(variantPickerProduct.variants || []).map((v: any) => {
                      const price = parseFloat(v.selling_price || variantPickerProduct.selling_price || 0);
                      const forSale = Math.max(0, (v.stock_quantity || 0) - (v.available_for_rent || 0));
                      const available = forSale > 0;
                      return (
                        <button
                          key={v.id}
                          onClick={() => available && handleAddProduct(variantPickerProduct, v)}
                          disabled={!available}
                          className={cn(
                            'flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all duration-150',
                            available
                              ? 'border-charcoal-500 bg-charcoal-700 hover:border-gold-600 hover:bg-gold-700/10 cursor-pointer'
                              : 'border-charcoal-600 bg-charcoal-700/40 opacity-50 cursor-not-allowed'
                          )}
                        >
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            {v.size && <span className="text-sm font-bold text-charcoal-50">{v.size}</span>}
                            {v.color && <span className="text-xs text-charcoal-300">{v.color}</span>}
                          </div>
                          <span className="text-sm font-semibold text-gold-400">{formatCurrency(price)}</span>
                          <span className={cn('text-xs mt-0.5', available ? 'text-charcoal-300' : 'text-red-400')}>
                            {available ? `${forSale} for sale` : 'No sale stock'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ─── Receipt Drawer ─── */}
      <Drawer open={showReceipt} onClose={() => setShowReceipt(false)} title="Receipt">
        {receipt && (
          <div className="space-y-4">
            <div className="text-center border-b border-charcoal-500 pb-4">
              <p className="font-display text-lg font-semibold text-charcoal-50">The Outfit Lounge</p>
              <p className="text-xs text-charcoal-200">Sale #{receipt.saleNumber}</p>
            </div>
            <div className="space-y-1.5">
              {receipt.items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-charcoal-100">{item.productName} ×{item.quantity}</span>
                  <span className="text-charcoal-50">{formatCurrency(item.itemSubtotal)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 pt-3 border-t border-charcoal-500 text-sm">
              <div className="flex justify-between"><span className="text-charcoal-200">Subtotal</span><span>{formatCurrency(receipt.subtotal)}</span></div>
              {receipt.promotionDiscount > 0 && <div className="flex justify-between text-emerald-400"><span>Promotion</span><span>-{formatCurrency(receipt.promotionDiscount)}</span></div>}
              {receipt.discountAmount > 0 && <div className="flex justify-between text-emerald-400"><span>Discount</span><span>-{formatCurrency(receipt.discountAmount)}</span></div>}
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-gold-400">{formatCurrency(receipt.totalAmount)}</span>
              </div>
              <div className="flex justify-between"><span className="text-charcoal-200">Paid</span><span>{formatCurrency(receipt.amountPaid)}</span></div>
              {receipt.changeAmount > 0 && <div className="flex justify-between text-emerald-400"><span>Change</span><span>{formatCurrency(receipt.changeAmount)}</span></div>}
            </div>
            {receipt?.customerId && (
              <div className="space-y-2 pt-2 border-t border-charcoal-600">
                <p className="text-xs text-charcoal-300 font-medium">Send Receipt to Customer</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    icon={<MessageCircle size={14} />}
                    onClick={() => handleSendInvoice('whatsapp')}
                    loading={sendingInvoice === 'whatsapp'}
                  >
                    WhatsApp
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<MessageSquare size={14} />}
                    onClick={() => handleSendInvoice('sms')}
                    loading={sendingInvoice === 'sms'}
                  >
                    SMS
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
              <Button variant="primary" className="flex-1" onClick={() => setShowReceipt(false)}>Done</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
