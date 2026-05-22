import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Barcode, ShoppingCart, Plus, Minus, Trash2,
  Package, X, Printer, CheckCircle, Tag, User,
  Banknote, CreditCard, Smartphone, Building2, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
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

export default function POSPage() {
  const qc = useQueryClient();
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');
  const [checkoutForm, setCheckoutForm] = useState({
    paymentMethod: 'cash',
    amountPaid: '',
    discount: '',
    notes: '',
  });
  const [variantPickerProduct, setVariantPickerProduct] = useState<any | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const {
    items: cartItems, addItem, removeItem, updateQuantity, updateDiscount,
    clearCart, getSubtotal, getTotal, discountAmount, setCartDiscount,
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
      setShowCheckout(false);
      setShowReceipt(true);
      clearCart();
      setCustomer(null, null);
      setSelectedPromotion(null);
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
          variantId: result.id,
          productId: result.product_id,
          productName: result.product_name,
          variantSku: result.sku,
          size: result.size,
          color: result.color,
          unitPrice: parseFloat(result.selling_price || 0),
          quantity: 1,
          discount: 0,
          subtotal: parseFloat(result.selling_price || 0),
        });
        toast.success(`Added: ${result.product_name} ${result.size || ''}`);
      } else if (result.variants?.length === 1) {
        const v = result.variants[0];
        addItem({
          variantId: v.id,
          productId: result.id,
          productName: result.name,
          variantSku: v.sku,
          size: v.size,
          color: v.color,
          unitPrice: parseFloat(v.selling_price || result.selling_price || 0),
          quantity: 1,
          discount: 0,
          subtotal: parseFloat(v.selling_price || result.selling_price || 0),
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
      variantId: variant.id,
      productId: product.id,
      productName: product.name,
      variantSku: variant.sku,
      size: variant.size,
      color: variant.color,
      image: product.primary_image,
      unitPrice: parseFloat(variant.selling_price || product.selling_price || 0),
      quantity: 1,
      discount: 0,
      subtotal: parseFloat(variant.selling_price || product.selling_price || 0),
    });
    setVariantPickerProduct(null);
  };

  const handleProductCardClick = (product: any) => {
    const saleQty = (v: any) => Math.max(0, (v.stock_quantity || 0) - (v.available_for_rent || 0));
    const saleVariants = (product.variants || []).filter((v: any) => saleQty(v) > 0);
    if (saleVariants.length === 1) {
      handleAddProduct(product, saleVariants[0]);
    } else if (saleVariants.length > 1) {
      setVariantPickerProduct(product);
    }
  };

  const subtotal = getSubtotal();
  const discount = parseFloat(checkoutForm.discount || '0');
  const promoDiscount = selectedPromotion
    ? calculatePromoDiscount(
        selectedPromotion,
        subtotal,
        cartItems.map(i => ({ unitPrice: i.unitPrice, quantity: i.quantity })),
        1,
        'pos'
      )
    : 0;
  const total = Math.max(0, subtotal - discount - discountAmount - promoDiscount);
  const isCash = checkoutForm.paymentMethod === 'cash';
  const amountPaid = isCash ? parseFloat(checkoutForm.amountPaid || String(total)) : total;
  const change = Math.max(0, amountPaid - total);

  const handleCheckout = () => {
    checkoutMutation.mutate({
      customerId: customerId || undefined,
      items: cartItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
      })),
      discountAmount: discount + discountAmount,
      promotionId: selectedPromotion?.id ?? null,
      paymentMethod: checkoutForm.paymentMethod,
      amountPaid,
      notes: checkoutForm.notes,
    });
  };

  const categoryOptions = [
    { value: '', label: 'All' },
    ...(categories || []).map((c: ProductCategory) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] -mx-4 lg:-mx-6 -my-4 lg:-my-6 overflow-hidden">
      {/* Left: Products */}
      <div className={cn(
        'flex-1 flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-charcoal-500',
        mobileTab === 'products' ? 'flex' : 'hidden lg:flex'
      )}>
        {/* Search bar */}
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
          {/* Category tabs */}
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

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin pb-20 lg:pb-4">
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
                      {product.primary_image ? (
                        <img src={product.primary_image} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package size={24} className="text-charcoal-300" />
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-medium text-charcoal-50 leading-tight truncate">{product.name}</p>
                      {multipleVariants ? (
                        <p className="text-xs text-gold-500/80 mt-0.5">{variants.length} sizes available</p>
                      ) : (
                        variants[0].size && <p className="text-xs text-charcoal-200 mt-0.5">Size: {variants[0].size}</p>
                      )}
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

      {/* Right: Cart */}
      <div className={cn(
        'w-full lg:w-80 xl:w-96 flex-col bg-charcoal-800 flex-shrink-0 overflow-hidden',
        mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
      )}>
        {/* Mobile back button */}
        <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b border-charcoal-500 bg-charcoal-900 flex-shrink-0">
          <button
            onClick={() => setMobileTab('products')}
            className="flex items-center gap-1.5 text-sm text-charcoal-200 hover:text-charcoal-50 transition-colors"
          >
            <ChevronLeft size={16} />
            Back to Products
          </button>
        </div>

        {/* Cart header */}
        <div className="p-4 border-b border-charcoal-500 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-charcoal-50 flex items-center gap-2">
              <ShoppingCart size={18} className="text-gold-400" />
              Cart
              {cartItems.length > 0 && (
                <span className="bg-gold-600 text-charcoal-900 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </h3>
            {cartItems.length > 0 && (
              <button onClick={clearCart} className="text-xs text-charcoal-200 hover:text-red-400 transition-colors">Clear</button>
            )}
          </div>

          {/* Customer quick-attach */}
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

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
          <AnimatePresence>
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-charcoal-300 py-12">
                <ShoppingCart size={40} className="mb-3 opacity-30" />
                <p className="text-sm">Cart is empty</p>
                <p className="text-xs mt-1">Add products or scan a barcode</p>
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
                    <div className="w-10 h-10 rounded-lg bg-charcoal-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="text-charcoal-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal-50 truncate">{item.productName}</p>
                      {(item.size || item.color) && (
                        <p className="text-xs text-charcoal-200">{[item.size, item.color].filter(Boolean).join(' / ')}</p>
                      )}
                      <p className="text-xs text-gold-500 mt-0.5">{formatCurrency(item.unitPrice)} each</p>
                    </div>
                    <button onClick={() => removeItem(item.variantId)} className="text-charcoal-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mt-2.5">
                    <div className="flex items-center gap-1 bg-charcoal-600 rounded-lg p-1">
                      <button onClick={() => updateQuantity(item.variantId, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center text-charcoal-200 hover:text-charcoal-50 transition-colors">
                        <Minus size={12} />
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-charcoal-50">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.variantId, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center text-charcoal-200 hover:text-charcoal-50 transition-colors">
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

                    <span className="text-sm font-semibold text-gold-400 flex-shrink-0">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Cart Footer */}
        {cartItems.length > 0 && (
          <div className="p-4 border-t border-charcoal-500 space-y-3 flex-shrink-0 bg-charcoal-800">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-charcoal-200">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-charcoal-50 font-bold text-base pt-1.5 border-t border-charcoal-500">
                <span>Total</span>
                <span className="text-gold-400">{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={discountAmount || ''}
                onChange={(e) => setCartDiscount(parseFloat(e.target.value) || 0)}
                onWheel={(e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
                placeholder="Cart discount (LKR)..."
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

            <Button
              variant="primary"
             
              className="w-full"
              onClick={() => setShowCheckout(true)}
              icon={<CheckCircle size={18} />}
            >
              Checkout — {formatCurrency(total)}
            </Button>
          </div>
        )}
      </div>

      {/* Variant Picker — portal to body to escape any transform stacking context */}
      {createPortal(
        <AnimatePresence>
        {variantPickerProduct && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
                {/* Header */}
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
                  <button
                    onClick={() => setVariantPickerProduct(null)}
                    className="text-charcoal-300 hover:text-charcoal-50 transition-colors flex-shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Variants grid */}
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
                          {v.size && (
                            <span className="text-sm font-bold text-charcoal-50">{v.size}</span>
                          )}
                          {v.color && (
                            <span className="text-xs text-charcoal-300">{v.color}</span>
                          )}
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

      {/* Checkout Modal */}
      <Drawer
        open={showCheckout}
        onClose={() => setShowCheckout(false)}
        title="Checkout"
       
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCheckout(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCheckout} loading={checkoutMutation.isPending} icon={<CheckCircle size={16} />}>
              Complete Sale
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-charcoal-600/50 rounded-xl space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-charcoal-200">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-emerald-400"><span>Discount</span><span>-{formatCurrency(discountAmount)}</span></div>}
            {checkoutForm.discount && <div className="flex justify-between text-emerald-400"><span>Extra Discount</span><span>-{formatCurrency(parseFloat(checkoutForm.discount))}</span></div>}
            {promoDiscount > 0 && selectedPromotion && (
              <div className="flex justify-between text-emerald-400">
                <span>Promotion ({selectedPromotion.name})</span>
                <span>-{formatCurrency(promoDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-charcoal-500">
              <span>Total</span>
              <span className="text-gold-400">{formatCurrency(total)}</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-charcoal-200 mb-2">Payment Method</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'cash', label: 'Cash', icon: Banknote },
                { value: 'card', label: 'Card', icon: CreditCard },
                { value: 'mobile_payment', label: 'Mobile Pay', icon: Smartphone },
                { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCheckoutForm({ ...checkoutForm, paymentMethod: value })}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-150',
                    checkoutForm.paymentMethod === value
                      ? 'border-gold-500 bg-gold-700/20 text-gold-400'
                      : 'border-charcoal-500 bg-charcoal-600/40 text-charcoal-200 hover:border-charcoal-400 hover:text-charcoal-50'
                  )}
                >
                  <Icon size={20} />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {isCash && (
            <>
              <Input
                label="Amount Paid (LKR)"
                type="number"
                step="0.01"
                min="0"
                value={checkoutForm.amountPaid}
                onChange={(e) => setCheckoutForm({ ...checkoutForm, amountPaid: e.target.value })}
                onWheel={(e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
                placeholder={total.toFixed(2)}
              />
              {amountPaid > total && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm">
                  <span className="text-emerald-400">Change: {formatCurrency(change)}</span>
                </div>
              )}
            </>
          )}

          <Input label="Notes (optional)" value={checkoutForm.notes} onChange={(e) => setCheckoutForm({ ...checkoutForm, notes: e.target.value })} placeholder="Any notes..." />
        </div>
      </Drawer>

      {/* Receipt Modal */}
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

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" icon={<Printer size={14} />} onClick={() => window.print()}>
                Print
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => setShowReceipt(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
