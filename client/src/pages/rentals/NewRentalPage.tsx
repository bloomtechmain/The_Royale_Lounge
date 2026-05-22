import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Minus, Trash2, CheckCircle, User, Package, Calendar, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { rentalService } from '@/services/rentalService';
import { customerService } from '@/services/customerService';
import { productService } from '@/services/productService';
import { calculatePromoDiscount } from '@/services/promotionService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import Textarea from '@/components/common/Textarea';
import PromotionSelector from '@/components/common/PromotionSelector';
import { formatCurrency, getDaysDiff } from '@/utils/formatters';
import type { Customer, ProductVariant, Promotion } from '@/types';

const STEPS = ['Customer', 'Items', 'Dates', 'Payment', 'Confirm'];

interface RentalCartItem {
  variantId: string;
  productName: string;
  variantInfo: string;
  sku: string;
  rentalPricePerDay: number;
  quantity: number;
  image?: string;
}

export default function NewRentalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', whatsapp: '', email: '' });

  const [cartItems, setCartItems] = useState<RentalCartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);

  const [rentalStartDate, setRentalStartDate] = useState('');
  const [rentalEndDate, setRentalEndDate] = useState('');
  const [eventType, setEventType] = useState('');
  const [notes, setNotes] = useState('');

  const [advancePayment, setAdvancePayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [manualDiscount, setManualDiscount] = useState('');
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);

  const { data: customerResults } = useQuery({
    queryKey: ['customer-search', customerSearch],
    queryFn: () => customerService.search(customerSearch),
    enabled: customerSearch.length > 1,
  });

  const { data: productResults } = useQuery({
    queryKey: ['product-search-rental', productSearch],
    queryFn: () => productService.getAll({ search: productSearch, type: 'rental', includeVariants: true, limit: 10 }),
    enabled: productSearch.length > 0,
  });

  const createCustomerMutation = useMutation({
    mutationFn: customerService.create,
    onSuccess: (c: any) => { setCustomer(c); setNewCustomerMode(false); setStep(1); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create customer'),
  });

  const createRentalMutation = useMutation({
    mutationFn: rentalService.create,
    onSuccess: (data: any) => {
      toast.success(`Booking ${data.booking_number} created!`);
      qc.invalidateQueries({ queryKey: ['rentals'] });
      navigate(`/rentals/${data.id}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create rental'),
  });

  const rentalDays = rentalStartDate && rentalEndDate
    ? Math.max(1, getDaysDiff(rentalStartDate, rentalEndDate))
    : 1;

  const totalCost = cartItems.reduce((sum, item) => sum + item.rentalPricePerDay * item.quantity * rentalDays, 0);

  const promoDiscount = selectedPromotion
    ? calculatePromoDiscount(
        selectedPromotion,
        totalCost,
        cartItems.map(i => ({ unitPrice: i.rentalPricePerDay, quantity: i.quantity })),
        rentalDays,
        'rental'
      )
    : 0;
  const manualDiscountAmt = parseFloat(manualDiscount || '0');
  const finalTotal = Math.max(0, totalCost - manualDiscountAmt - promoDiscount);

  const addToCart = (variant: any, productName: string) => {
    const existing = cartItems.find((i) => i.variantId === variant.id);
    if (existing) {
      setCartItems(cartItems.map((i) => i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCartItems([...cartItems, {
        variantId: variant.id,
        productName,
        variantInfo: [variant.size, variant.color].filter(Boolean).join(' / '),
        sku: variant.sku,
        rentalPricePerDay: parseFloat(variant.rental_price_per_day || variant.rentalPricePerDay || 0),
        quantity: 1,
      }]);
    }
    setProductSearch('');
    setShowProductResults(false);
  };

  const handleSubmit = () => {
    if (!customer || !rentalStartDate || !rentalEndDate || cartItems.length === 0) return;

    createRentalMutation.mutate({
      customerId: customer.id,
      rentalStartDate,
      rentalEndDate,
      items: cartItems.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        rentalPricePerDay: i.rentalPricePerDay,
      })),
      advancePayment: parseFloat(advancePayment || '0'),
      discountAmount: manualDiscountAmt,
      promotionId: selectedPromotion?.id ?? null,
      eventType,
      notes,
      paymentMethod,
    });
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">New Rental Booking</h2>
        <Button variant="secondary" onClick={() => navigate('/rentals')}>Cancel</Button>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-0 mb-6">
        {STEPS.map((label, i) => {
          const icons = [User, Package, Calendar, CreditCard, CheckCircle];
          const Icon = icons[i];
          return (
            <div key={i} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium flex-shrink-0 transition-all duration-200 ${
                i < step ? 'bg-gold-gradient text-charcoal-900' :
                i === step ? 'bg-charcoal-600 border-2 border-gold-600 text-gold-400' :
                'bg-charcoal-600 border border-charcoal-400 text-charcoal-300'
              }`}>
                {i < step ? <CheckCircle size={14} /> : <Icon size={14} />}
              </div>
              <span className={`ml-2 text-xs hidden sm:inline ${i === step ? 'text-charcoal-50 font-medium' : 'text-charcoal-300'}`}>{label}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 ${i < step ? 'bg-gold-700' : 'bg-charcoal-500'}`} />}
            </div>
          );
        })}
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: step form */}
        <div className="flex-1 min-w-0">
        <Card>
        <AnimatePresence mode="wait">
          {/* Step 0: Customer */}
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Select Customer</h3>
              {!newCustomerMode ? (
                <>
                  <div className="relative">
                    <Input
                      label="Search Customer"
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerResults(true); }}
                      placeholder="Search by name or phone..."
                      icon={<Search size={15} />}
                    />
                    {showCustomerResults && customerResults && customerResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-charcoal-700 border border-charcoal-500 rounded-xl shadow-card z-10 overflow-hidden">
                        {customerResults.map((c: Customer) => (
                          <button
                            key={c.id}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-charcoal-600 transition-colors"
                            onClick={() => { setCustomer(c); setCustomerSearch(c.name); setShowCustomerResults(false); }}
                          >
                            <div className="w-8 h-8 rounded-full bg-gold-700/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-gold-400 text-sm font-semibold">{c.name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-charcoal-50">{c.name}</p>
                              {c.phone && <p className="text-xs text-charcoal-200">{c.phone}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {customer && (
                    <div className="p-4 bg-charcoal-600/50 rounded-xl border border-gold-700/30 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gold-700/20 flex items-center justify-center">
                        <span className="text-gold-400 font-semibold">{customer.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-charcoal-50">{customer.name}</p>
                        <p className="text-sm text-charcoal-200">{customer.phone}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>Change</Button>
                    </div>
                  )}

                  <button
                    onClick={() => setNewCustomerMode(true)}
                    className="w-full p-3 border-2 border-dashed border-charcoal-400 rounded-xl text-sm text-charcoal-200 hover:border-gold-700/50 hover:text-charcoal-100 transition-colors"
                  >
                    <Plus size={14} className="inline mr-2" /> Create New Customer
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-charcoal-100">New Customer</p>
                    <button onClick={() => setNewCustomerMode(false)} className="text-xs text-charcoal-200 hover:text-charcoal-50">Cancel</button>
                  </div>
                  <Input placeholder="Full Name *" value={newCustomerForm.name} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input placeholder="Phone" value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })} />
                    <Input placeholder="WhatsApp" value={newCustomerForm.whatsapp} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, whatsapp: e.target.value })} />
                  </div>
                  <Input placeholder="Email" type="email" value={newCustomerForm.email} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })} />
                  <Button variant="primary" size="sm" onClick={() => createCustomerMutation.mutate(newCustomerForm)} loading={createCustomerMutation.isPending}>
                    Save & Continue
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 1: Items */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Select Items</h3>

              {/* Search */}
              <div className="relative">
                <Input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductResults(true); }}
                  onFocus={() => setShowProductResults(true)}
                  onBlur={() => setTimeout(() => setShowProductResults(false), 150)}
                  placeholder="Search rental items by name or SKU..."
                  icon={<Search size={15} />}
                />
                {showProductResults && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-charcoal-700 border border-charcoal-500 rounded-xl shadow-card z-10 overflow-hidden max-h-72 overflow-y-auto">
                    {(productResults?.data?.length ?? 0) === 0 ? (
                      <p className="text-xs text-charcoal-300 text-center py-4">
                        {productSearch.length === 0 ? 'Start typing to search rental items...' : 'No rental items found'}
                      </p>
                    ) : (
                      productResults?.data.map((product: any) => {
                        const variants = (product.variants || []).filter((v: any) => (v.available_for_rent ?? v.stock_quantity) > 0);
                        if (variants.length === 0) return null;
                        return variants.map((v: any) => (
                          <button
                            key={v.id}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-charcoal-600 transition-colors border-b border-charcoal-600/50 last:border-0"
                            onMouseDown={() => addToCart(v, product.name)}
                          >
                            <Package size={14} className="text-charcoal-300 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-charcoal-50 truncate">{product.name}</p>
                              <p className="text-xs text-charcoal-200">{[v.size, v.color].filter(Boolean).join(' / ')} · {v.sku}</p>
                              <p className="text-xs text-gold-500 mt-0.5">{formatCurrency(v.rental_price_per_day)}/day</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-xs font-medium text-emerald-400">{v.available_for_rent ?? v.stock_quantity} avail</span>
                            </div>
                          </button>
                        ));
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Cart */}
              {cartItems.length === 0 ? (
                <div className="py-8 text-center text-charcoal-200 text-sm">No items added yet. Search for products above.</div>
              ) : (
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div key={item.variantId} className="flex items-center gap-3 p-3 bg-charcoal-600/50 rounded-xl">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-charcoal-50">{item.productName}</p>
                        <p className="text-xs text-charcoal-200">{item.variantInfo} · {formatCurrency(item.rentalPricePerDay)}/day</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setCartItems(cartItems.map((i) => i.variantId === item.variantId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} className="w-7 h-7 rounded-lg bg-charcoal-500 flex items-center justify-center text-charcoal-100 hover:bg-charcoal-400">
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center text-sm font-medium text-charcoal-50">{item.quantity}</span>
                        <button onClick={() => setCartItems(cartItems.map((i) => i.variantId === item.variantId ? { ...i, quantity: i.quantity + 1 } : i))} className="w-7 h-7 rounded-lg bg-charcoal-500 flex items-center justify-center text-charcoal-100 hover:bg-charcoal-400">
                          <Plus size={12} />
                        </button>
                        <button onClick={() => setCartItems(cartItems.filter((i) => i.variantId !== item.variantId))} className="text-charcoal-200 hover:text-red-400 ml-1">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Step 2: Dates */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Rental Dates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Pickup Date"
                  type="date"
                  min={today}
                  value={rentalStartDate}
                  onChange={(e) => setRentalStartDate(e.target.value)}
                  required
                />
                <Input
                  label="Return Date"
                  type="date"
                  min={rentalStartDate || today}
                  value={rentalEndDate}
                  onChange={(e) => setRentalEndDate(e.target.value)}
                  required
                />
              </div>
              <Input label="Event Type" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Wedding, Formal Dinner, Gala" />
              <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special requests or notes..." rows={2} />

              {rentalStartDate && rentalEndDate && (
                <div className="p-3 bg-charcoal-600/50 rounded-xl">
                  <p className="text-sm text-charcoal-200">Rental duration: <span className="text-charcoal-50 font-medium">{rentalDays} day(s)</span></p>
                  <p className="text-sm text-charcoal-200 mt-1">Estimated total: <span className="text-gold-400 font-semibold">{formatCurrency(totalCost)}</span></p>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 3: Payment */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Payment Details</h3>

              <div className="p-4 bg-charcoal-600/30 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-200">Total Rental Cost:</span>
                  <span className="text-charcoal-50 font-medium">{formatCurrency(totalCost)}</span>
                </div>
                {manualDiscountAmt > 0 && (
                  <div className="flex justify-between text-sm text-emerald-400">
                    <span>Manual Discount:</span>
                    <span>-{formatCurrency(manualDiscountAmt)}</span>
                  </div>
                )}
                {promoDiscount > 0 && selectedPromotion && (
                  <div className="flex justify-between text-sm text-emerald-400">
                    <span>Promotion ({selectedPromotion.name}):</span>
                    <span>-{formatCurrency(promoDiscount)}</span>
                  </div>
                )}
                {(manualDiscountAmt > 0 || promoDiscount > 0) && (
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-charcoal-500">
                    <span className="text-charcoal-100">Net Total:</span>
                    <span className="text-gold-400">{formatCurrency(finalTotal)}</span>
                  </div>
                )}
              </div>

              <Select
                label="Payment Method"
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'card', label: 'Card' },
                  { value: 'mobile_payment', label: 'Mobile Payment' },
                  { value: 'bank_transfer', label: 'Bank Transfer' },
                ]}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <Input label="Advance Payment (LKR)" type="number" step="0.01" min="0" value={advancePayment} onChange={(e) => setAdvancePayment(e.target.value)} placeholder="0.00" hint="Amount paid upfront now" />
              <Input
                label="Manual Discount (LKR)"
                type="number"
                step="0.01"
                min="0"
                value={manualDiscount}
                onChange={(e) => setManualDiscount(e.target.value)}
                placeholder="0.00"
                hint="Optional cashier-applied discount"
              />
              <PromotionSelector
                scope="rental"
                cartSubtotal={totalCost}
                cartItems={cartItems.map(i => ({ unitPrice: i.rentalPricePerDay, quantity: i.quantity }))}
                rentalDays={rentalDays}
                selectedId={selectedPromotion?.id ?? null}
                onSelect={setSelectedPromotion}
              />
            </motion.div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h3 className="section-title">Booking Summary</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Customer', value: customer?.name },
                    { label: 'Phone', value: customer?.phone || '—' },
                    { label: 'Pickup Date', value: rentalStartDate },
                    { label: 'Return Date', value: rentalEndDate },
                    { label: 'Duration', value: `${rentalDays} day(s)` },
                    { label: 'Event', value: eventType || '—' },
                    { label: 'Items', value: `${cartItems.length} item(s)` },
                    { label: 'Rental Cost', value: formatCurrency(totalCost) },
                    ...(promoDiscount > 0 || manualDiscountAmt > 0 ? [{ label: 'Net Total', value: formatCurrency(finalTotal) }] : []),
                    ...(selectedPromotion ? [{ label: 'Promotion', value: selectedPromotion.name }] : []),
                    { label: 'Advance Paid', value: formatCurrency(parseFloat(advancePayment || '0')) },
                    { label: 'Balance Due', value: formatCurrency(Math.max(0, finalTotal - parseFloat(advancePayment || '0'))) },
                    { label: 'Payment Method', value: paymentMethod },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-3 bg-charcoal-600/50 rounded-xl">
                      <p className="text-xs text-charcoal-200">{label}</p>
                      <p className="text-sm font-medium text-charcoal-50 mt-0.5 capitalize">{value}</p>
                    </div>
                  ))}
                </div>
                {notes && (
                  <div className="p-3 bg-charcoal-600/50 rounded-xl">
                    <p className="text-xs text-charcoal-200">Notes</p>
                    <p className="text-sm text-charcoal-100 mt-0.5">{notes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav */}
        <div className="flex justify-between mt-6 pt-5 border-t border-charcoal-500">
          <Button variant="secondary" onClick={() => step > 0 ? setStep(step - 1) : navigate('/rentals')} disabled={createRentalMutation.isPending}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 0 && !customer) ||
                (step === 1 && cartItems.length === 0) ||
                (step === 2 && (!rentalStartDate || !rentalEndDate))
              }
            >
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit} loading={createRentalMutation.isPending} icon={<CheckCircle size={16} />}>
              Confirm Booking
            </Button>
          )}
        </div>
        </Card>
        </div>{/* end left column */}

        {/* Right: real-time summary */}
        <div className="w-80 xl:w-96 flex-shrink-0 sticky top-6">
          <div className="bg-charcoal-700 border border-charcoal-500 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-charcoal-600 bg-charcoal-600/40">
              <h3 className="font-display text-sm font-semibold text-charcoal-50">Booking Summary</h3>
            </div>

            {/* Customer */}
            <div className="px-4 py-3 border-b border-charcoal-600">
              <p className="text-xs text-charcoal-300 uppercase tracking-wide mb-2 flex items-center gap-1.5"><User size={11} />Customer</p>
              {customer ? (
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gold-700/20 border border-gold-700/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-gold-400 text-xs font-semibold">{customer.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-charcoal-50">{customer.name}</p>
                    {customer.phone && <p className="text-xs text-charcoal-300">{customer.phone}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-charcoal-400 italic">Not selected yet</p>
              )}
            </div>

            {/* Items */}
            <div className="px-4 py-3 border-b border-charcoal-600">
              <p className="text-xs text-charcoal-300 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Package size={11} />Items {cartItems.length > 0 && <span className="text-gold-500">({cartItems.length})</span>}</p>
              {cartItems.length === 0 ? (
                <p className="text-xs text-charcoal-400 italic">No items added yet</p>
              ) : (
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div key={item.variantId} className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-charcoal-100 truncate">{item.productName}</p>
                        <p className="text-xs text-charcoal-400">{item.variantInfo || item.sku} × {item.quantity}</p>
                      </div>
                      <p className="text-xs text-gold-500 flex-shrink-0">{formatCurrency(item.rentalPricePerDay * item.quantity * rentalDays)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="px-4 py-3 border-b border-charcoal-600">
              <p className="text-xs text-charcoal-300 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Calendar size={11} />Dates</p>
              {rentalStartDate ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-charcoal-400">Pickup</span>
                    <span className="text-charcoal-100 font-medium">{rentalStartDate}</span>
                  </div>
                  {rentalEndDate && (
                    <div className="flex justify-between text-xs">
                      <span className="text-charcoal-400">Return</span>
                      <span className="text-charcoal-100 font-medium">{rentalEndDate}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-charcoal-400">Duration</span>
                    <span className="text-charcoal-100 font-medium">{rentalDays} day{rentalDays !== 1 ? 's' : ''}</span>
                  </div>
                  {eventType && (
                    <div className="flex justify-between text-xs">
                      <span className="text-charcoal-400">Event</span>
                      <span className="text-charcoal-100">{eventType}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-charcoal-400 italic">Not set yet</p>
              )}
            </div>

            {/* Payment & Total */}
            <div className="px-4 py-3">
              <p className="text-xs text-charcoal-300 uppercase tracking-wide mb-2 flex items-center gap-1.5"><CreditCard size={11} />Payment</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-charcoal-400">Rental Cost</span>
                  <span className="text-gold-400 font-semibold">{formatCurrency(totalCost)}</span>
                </div>
                {(promoDiscount > 0 || manualDiscountAmt > 0) && (
                  <div className="flex justify-between text-xs text-emerald-400">
                    <span>Discount</span>
                    <span>-{formatCurrency(promoDiscount + manualDiscountAmt)}</span>
                  </div>
                )}
                {(promoDiscount > 0 || manualDiscountAmt > 0) && (
                  <div className="flex justify-between text-xs font-semibold pt-1 border-t border-charcoal-600">
                    <span className="text-charcoal-200">Net Total</span>
                    <span className="text-gold-400">{formatCurrency(finalTotal)}</span>
                  </div>
                )}
                {advancePayment && parseFloat(advancePayment) > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-charcoal-400">Advance Paid</span>
                      <span className="text-emerald-400">{formatCurrency(parseFloat(advancePayment))}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-charcoal-600">
                      <span className="text-charcoal-200 font-medium">Balance Due</span>
                      <span className="text-charcoal-50 font-semibold">{formatCurrency(Math.max(0, finalTotal - parseFloat(advancePayment)))}</span>
                    </div>
                  </>
                )}
                {paymentMethod && (
                  <div className="flex justify-between text-xs">
                    <span className="text-charcoal-400">Method</span>
                    <span className="text-charcoal-100 capitalize">{paymentMethod.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>{/* end flex row */}
    </div>
  );
}
