import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { RotateCcw, AlertTriangle, CheckCircle, Package, Clock, XCircle, Banknote, CreditCard, Smartphone, Building2, MessageCircle, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import { returnService } from '@/services/returnService';
import { rentalService } from '@/services/rentalService';
import { settingsService } from '@/services/settingsService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import Drawer from '@/components/common/Drawer';
import Input from '@/components/common/Input';
import Table from '@/components/common/Table';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/utils/cn';

// ── pure helper (no hooks) ────────────────────────────────────────────────────
function calcDamageCharge(
  item: any,
  rental: any,
  dmgType: string,
  dmgFlat: number,
  dmgPercent: number,
): number {
  if (dmgType === 'none') return 0;
  if (dmgType === 'flat') return dmgFlat;
  if (dmgType === 'percentage_of_rental' && rental) {
    const days = Math.max(1, Math.ceil(
      (new Date(rental.rental_end_date).getTime() - new Date(rental.rental_start_date).getTime())
      / (1000 * 60 * 60 * 24),
    ));
    const cost = parseFloat(item.rental_price_per_day || 0) * (item.quantity || 1) * days;
    return cost * (dmgPercent / 100);
  }
  return 0;
}

function isSaleItem(item: any) {
  return item.product_type === 'sale' || item.product_type === 'both';
}

const PAYMENT_METHODS = [
  { value: 'cash',           label: 'Cash',         icon: Banknote   },
  { value: 'card',           label: 'Card',         icon: CreditCard },
  { value: 'mobile_payment', label: 'Mobile Pay',   icon: Smartphone },
  { value: 'bank_transfer',  label: 'Bank Transfer',icon: Building2  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
export default function ReturnsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedRental, setSelectedRental] = useState<any>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  // condition per item: 'good' | 'damaged' | 'lost'
  const [itemConditions, setItemConditions] = useState<Record<string, string>>({});
  // custom charge only for lost items that have no selling price
  const [itemCustomCharges, setItemCustomCharges] = useState<Record<string, string>>({});
  const [itemRemarks, setItemRemarks] = useState<Record<string, string>>({});
  const [fineCalc, setFineCalc] = useState<any>(null);
  const [collectFine, setCollectFine] = useState(true);
  const [sendInvoiceRentalId, setSendInvoiceRentalId] = useState<string | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<'whatsapp' | 'sms' | null>(null);

  // ── data ──────────────────────────────────────────────────────────────────
  const { data: pendingReturns, isLoading } = useQuery({
    queryKey: ['pending-returns'],
    queryFn: returnService.getPending,
    refetchInterval: 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.getAll(),
  });

  const dmgType    = settings?.['damage_charge_type']?.value    || 'none';
  const dmgFlat    = parseFloat(settings?.['damage_flat_charge']?.value    || '0');
  const dmgPercent = parseFloat(settings?.['damage_charge_percent']?.value || '0');

  // Re-fetch fine whenever returnDate changes while modal is open
  useEffect(() => {
    if (!showReturnModal || !selectedRental) return;
    returnService.getFineCalc(selectedRental.id, returnDate)
      .then(setFineCalc)
      .catch(() => setFineCalc(null));
  }, [returnDate, selectedRental?.id, showReturnModal]);

  // ── mutations ─────────────────────────────────────────────────────────────
  const processReturnMutation = useMutation({
    mutationFn: ({ rentalId, payload }: { rentalId: string; payload: any }) =>
      returnService.processReturn(rentalId, payload),
    onSuccess: (data, variables) => {
      toast.success('Return processed successfully!');
      if (data.fine?.totalFine > 0)
        toast.warning(`Late fine collected: ${formatCurrency(data.fine.totalFine)}`);
      if (data.totalDamageCharge > 0)
        toast.warning(`Damage / loss charge collected: ${formatCurrency(data.totalDamageCharge)}`);
      setSendInvoiceRentalId(variables.rentalId);
      setShowReturnModal(false);
      setSelectedRental(null);
      qc.invalidateQueries({ queryKey: ['pending-returns'] });
      qc.invalidateQueries({ queryKey: ['rentals'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to process return'),
  });

  const handleSendReturnInvoice = async (channel: 'whatsapp' | 'sms') => {
    if (!sendInvoiceRentalId) return;
    setSendingInvoice(channel);
    try {
      const res = await api.post('/notifications/send-invoice', {
        type: 'rental', referenceId: sendInvoiceRentalId, channel,
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

  // ── open modal ────────────────────────────────────────────────────────────
  const openReturnModal = async (rental: any) => {
    setSelectedRental(rental);
    const conditions: Record<string, string> = {};
    try {
      const full = await rentalService.getById(rental.id);
      setSelectedRental(full);
      (full.items || []).forEach((item: any) => {
        if (!item.is_returned) conditions[item.id] = 'good';
      });
    } catch {
      (rental.items || []).forEach((item: any) => {
        conditions[item.id] = 'good';
      });
    }
    setItemConditions(conditions);
    setItemCustomCharges({});
    setItemRemarks({});
    setCollectFine(true);
    try {
      const fine = await returnService.getFineCalc(rental.id, returnDate);
      setFineCalc(fine);
    } catch {
      setFineCalc(null);
    }
    setShowReturnModal(true);
  };

  // ── submit ────────────────────────────────────────────────────────────────
  const handleProcessReturn = () => {
    if (!selectedRental) return;
    const items = Object.entries(itemConditions).map(([id, condition]) => {
      const charge = condition !== 'good' ? parseFloat(itemCustomCharges[id] || '0') || 0 : 0;
      const remark = itemRemarks[id] || '';
      return { rentalItemId: id, condition, charge, remark };
    });
    processReturnMutation.mutate({
      rentalId: selectedRental.id,
      payload: { items, returnDate, paymentMethod, collectFine },
    });
  };

  // ── total charge preview ──────────────────────────────────────────────────
  const totalDamageCharge = useMemo(() => {
    if (!selectedRental) return 0;
    return (selectedRental.items || [])
      .filter((i: any) => !i.is_returned)
      .reduce((sum: number, item: any) => {
        const cond = itemConditions[item.id] || 'good';
        if (cond !== 'good') {
          return sum + (parseFloat(itemCustomCharges[item.id] || '0') || 0);
        }
        return sum;
      }, 0);
  }, [itemConditions, itemCustomCharges, selectedRental]);

  // ── table data ────────────────────────────────────────────────────────────
  const overdueReturns = (pendingReturns || []).filter((r: any) => parseInt(r.days_overdue) > 0);
  const todayReturns   = (pendingReturns || []).filter((r: any) => parseInt(r.days_overdue) === 0);

  const columns = [
    {
      key: 'booking',
      header: 'Booking',
      render: (r: any) => (
        <div>
          <p className="font-medium text-gold-500">{r.booking_number}</p>
          <p className="text-xs text-charcoal-200">{r.event_type || ''}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r: any) => (
        <div>
          <p className="text-sm font-medium text-charcoal-50">{r.customer_name}</p>
          {r.customer_phone && <p className="text-xs text-charcoal-200">{r.customer_phone}</p>}
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Due Date',
      render: (r: any) => (
        <div>
          <p className="text-sm">{formatDate(r.rental_end_date)}</p>
          {parseInt(r.days_overdue) > 0 && (
            <p className="text-xs text-red-400 font-medium mt-0.5">{r.days_overdue} day(s) overdue</p>
          )}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      render: (r: any) => <span className="text-charcoal-100">{r.pending_items} remaining</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: any) => <Badge status={r.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (r: any) => (
        <Button
          variant="primary"
          icon={<RotateCcw size={13} />}
          onClick={(e: any) => { e.stopPropagation(); openReturnModal(r); }}
        >
          Process
        </Button>
      ),
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="page-header">
        <h2 className="page-title">Returns & Fines</h2>
        <Button
          variant="secondary"
          icon={<RotateCcw size={16} />}
          onClick={() => qc.invalidateQueries({ queryKey: ['pending-returns'] })}
        >
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="p-3 bg-amber-500/15 rounded-xl text-amber-400"><Clock size={20} /></div>
          <div>
            <p className="text-2xl font-semibold text-charcoal-50">{todayReturns.length}</p>
            <p className="text-xs text-charcoal-200">Due Today</p>
          </div>
        </Card>
        <Card className={cn('flex items-center gap-4', overdueReturns.length > 0 ? 'border-red-500/30' : '')}>
          <div className={cn('p-3 rounded-xl', overdueReturns.length > 0 ? 'bg-red-500/15 text-red-400' : 'bg-charcoal-600 text-charcoal-200')}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-charcoal-50">{overdueReturns.length}</p>
            <p className="text-xs text-charcoal-200">Overdue Returns</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="p-3 bg-green-500/15 rounded-xl text-green-400"><CheckCircle size={20} /></div>
          <div>
            <p className="text-2xl font-semibold text-charcoal-50">{pendingReturns?.length || 0}</p>
            <p className="text-xs text-charcoal-200">Total Pending</p>
          </div>
        </Card>
      </div>

      {overdueReturns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3"
        >
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-300">{overdueReturns.length} overdue return(s) require immediate attention</p>
            <p className="text-sm text-red-400/70 mt-0.5">These customers are accumulating late fees daily</p>
          </div>
        </motion.div>
      )}

      <Card padding="none">
        <Table
          columns={columns}
          data={pendingReturns || []}
          loading={isLoading}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/rentals/${r.id}`)}
          emptyMessage="No pending returns — all clear!"
        />
      </Card>

      {/* ── Return Drawer ─────────────────────────────────────────────────── */}
      <Drawer
        open={showReturnModal}
        onClose={() => { setShowReturnModal(false); setSelectedRental(null); }}
        title={`Process Return — ${selectedRental?.booking_number}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowReturnModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleProcessReturn}
              loading={processReturnMutation.isPending}
              icon={<CheckCircle size={16} />}
            >
              Confirm Return
            </Button>
          </>
        }
      >
        <div className="space-y-5">

          {/* Item condition tiles */}
          <div>
            <h4 className="text-sm font-semibold text-charcoal-100 mb-3">Item Conditions</h4>
            <div className="space-y-3">
              {(selectedRental?.items || []).filter((i: any) => !i.is_returned).map((item: any) => {
                const cond = itemConditions[item.id] || 'good';
                const dmgCharge    = calcDamageCharge(item, selectedRental, dmgType, dmgFlat, dmgPercent);
                const hasSellingPx = isSaleItem(item) && item.product_selling_price && parseFloat(item.product_selling_price) > 0;

                return (
                  <div key={item.id} className="p-3 bg-charcoal-600/40 rounded-xl space-y-3">
                    {/* Item info */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-charcoal-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {item.product_image
                          ? <img src={item.product_image} alt="" className="w-full h-full object-cover" />
                          : <Package size={14} className="text-charcoal-300" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-charcoal-50 truncate">{item.product_name}</p>
                        <p className="text-xs text-charcoal-200">
                          {[item.size, item.color].filter(Boolean).join(' / ')}
                          {item.quantity > 1 && ` · ×${item.quantity}`}
                        </p>
                      </div>
                    </div>

                    {/* Condition tiles */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* Good */}
                      <button
                        onClick={() => {
                          setItemConditions({ ...itemConditions, [item.id]: 'good' });
                          const { [item.id]: _, ...rest } = itemCustomCharges;
                          setItemCustomCharges(rest);
                          const { [item.id]: __, ...restR } = itemRemarks;
                          setItemRemarks(restR);
                        }}
                        className={cn(
                          'flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all',
                          cond === 'good'
                            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                            : 'bg-charcoal-700/50 border-charcoal-500 text-charcoal-300 hover:border-charcoal-300 hover:text-charcoal-100',
                        )}
                      >
                        <CheckCircle size={15} />
                        Good
                      </button>

                      {/* Damaged */}
                      <button
                        onClick={() => {
                          setItemConditions({ ...itemConditions, [item.id]: 'damaged' });
                          // Pre-fill with auto-calculated charge so user can edit it
                          const auto = calcDamageCharge(item, selectedRental, dmgType, dmgFlat, dmgPercent);
                          setItemCustomCharges({ ...itemCustomCharges, [item.id]: auto > 0 ? String(auto) : '' });
                        }}
                        className={cn(
                          'flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all',
                          cond === 'damaged'
                            ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                            : 'bg-charcoal-700/50 border-charcoal-500 text-charcoal-300 hover:border-charcoal-300 hover:text-charcoal-100',
                        )}
                      >
                        <AlertTriangle size={15} />
                        Damaged
                      </button>

                      {/* Lost */}
                      <button
                        onClick={() => {
                          setItemConditions({ ...itemConditions, [item.id]: 'lost' });
                          // Pre-fill with selling price if available
                          const auto = isSaleItem(item) && item.product_selling_price
                            ? String(parseFloat(item.product_selling_price))
                            : '';
                          setItemCustomCharges({ ...itemCustomCharges, [item.id]: auto });
                        }}
                        className={cn(
                          'flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all',
                          cond === 'lost'
                            ? 'bg-red-500/15 border-red-500/50 text-red-400'
                            : 'bg-charcoal-700/50 border-charcoal-500 text-charcoal-300 hover:border-charcoal-300 hover:text-charcoal-100',
                        )}
                      >
                        <XCircle size={15} />
                        Lost
                      </button>
                    </div>

                    {/* Damaged — editable charge + remark */}
                    {cond === 'damaged' && (
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-amber-300">Damage charge (LKR)</p>
                            {dmgCharge > 0 && (
                              <span className="text-[10px] text-amber-400/60">
                                Auto: {formatCurrency(dmgCharge)}
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={itemCustomCharges[item.id] ?? ''}
                            onChange={(e) => setItemCustomCharges({ ...itemCustomCharges, [item.id]: e.target.value })}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full bg-charcoal-600 border border-amber-500/30 rounded-xl px-3 py-2 text-sm text-charcoal-50 placeholder-charcoal-400 focus:outline-none focus:border-amber-500/60"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-amber-300">Remark</p>
                          <textarea
                            rows={2}
                            placeholder="Describe the damage..."
                            value={itemRemarks[item.id] ?? ''}
                            onChange={(e) => setItemRemarks({ ...itemRemarks, [item.id]: e.target.value })}
                            className="w-full bg-charcoal-600 border border-amber-500/30 rounded-xl px-3 py-2 text-sm text-charcoal-50 placeholder-charcoal-400 focus:outline-none focus:border-amber-500/60 resize-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Lost — editable charge (pre-filled from selling price or blank) */}
                    {cond === 'lost' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-red-300">Lost item charge (LKR)</p>
                          {hasSellingPx && (
                            <span className="text-[10px] text-red-400/60">
                              Selling price: {formatCurrency(item.product_selling_price)}
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={itemCustomCharges[item.id] ?? ''}
                          onChange={(e) => setItemCustomCharges({ ...itemCustomCharges, [item.id]: e.target.value })}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full bg-charcoal-600 border border-red-500/30 rounded-xl px-3 py-2 text-sm text-charcoal-50 placeholder-charcoal-400 focus:outline-none focus:border-red-500/60"
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {(selectedRental?.items || []).filter((i: any) => !i.is_returned).length === 0 && (
                <p className="text-sm text-charcoal-200 text-center py-3">All items already returned</p>
              )}
            </div>
          </div>

          {/* Return date */}
          <Input
            label="Return Date"
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />

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
                  <Icon size={18} />
                  <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Late fine */}
          {fineCalc && (
            <div className={cn('p-4 rounded-xl', fineCalc.totalFine > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20')}>
              {fineCalc.totalFine > 0 ? (
                <>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-semibold text-red-300">Late Return Fine</p>
                    {/* Waive toggle */}
                    <button
                      onClick={() => setCollectFine(!collectFine)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all flex-shrink-0',
                        collectFine
                          ? 'bg-red-500/15 border-red-500/40 text-red-300 hover:bg-charcoal-600 hover:border-charcoal-400 hover:text-charcoal-200'
                          : 'bg-charcoal-600 border-charcoal-400 text-charcoal-300 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-300'
                      )}
                    >
                      {collectFine ? <><AlertTriangle size={11} /> Collect fine</> : <><XCircle size={11} /> Fine waived</>}
                    </button>
                  </div>
                  <div className="space-y-1 text-sm text-charcoal-200">
                    <p>Days late: <span className="text-red-400 font-medium">{fineCalc.daysLate}</span></p>
                    <p>Fine / day: <span className="text-red-400 font-medium">{formatCurrency(fineCalc.finePerDay)}</span></p>
                    <p className={cn('text-base font-semibold mt-1', collectFine ? 'text-red-300' : 'line-through text-charcoal-400')}>
                      Total fine: {formatCurrency(fineCalc.totalFine)}
                    </p>
                    {!collectFine && (
                      <p className="text-xs text-charcoal-400 italic">Fine will not be charged</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-emerald-400 font-medium flex items-center gap-2">
                  <CheckCircle size={15} /> Returned on time — no fine
                </p>
              )}
            </div>
          )}

          {/* Charges summary */}
          {(totalDamageCharge > 0 || (collectFine && (fineCalc?.totalFine ?? 0) > 0)) && (
            <div className="p-4 bg-charcoal-600/40 rounded-xl space-y-2">
              <p className="text-sm font-semibold text-charcoal-100 mb-1">Charges Summary</p>
              {collectFine && (fineCalc?.totalFine ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-200">Late fine</span>
                  <span className="text-red-400">{formatCurrency(fineCalc.totalFine)}</span>
                </div>
              )}
              {totalDamageCharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-200">Damage / lost charges</span>
                  <span className="text-red-400">{formatCurrency(totalDamageCharge)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold border-t border-charcoal-500 pt-2 mt-1">
                <span className="text-charcoal-100">Total to collect</span>
                <span className="text-amber-400">
                  {formatCurrency((collectFine ? (fineCalc?.totalFine ?? 0) : 0) + totalDamageCharge)}
                </span>
              </div>
            </div>
          )}

        </div>
      </Drawer>

      {/* ── Send Return Invoice ───────────────────────────────────────────── */}
      <Drawer
        open={!!sendInvoiceRentalId}
        onClose={() => setSendInvoiceRentalId(null)}
        title="Send Return Receipt"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <CheckCircle size={20} className="text-emerald-400 flex-shrink-0" />
            <p className="text-sm text-emerald-300">Return processed successfully! Send a receipt to the customer?</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSendReturnInvoice('whatsapp')}
              disabled={!!sendingInvoice}
              className={cn(
                'flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all',
                'border-charcoal-500 hover:border-green-500/60 hover:bg-green-500/10',
                sendingInvoice === 'whatsapp' && 'opacity-60 cursor-wait'
              )}
            >
              <MessageCircle size={28} className="text-green-400" />
              <div className="text-center">
                <p className="font-medium text-charcoal-50">WhatsApp</p>
                <p className="text-xs text-charcoal-300 mt-0.5">Opens WhatsApp with invoice</p>
              </div>
            </button>
            <button
              onClick={() => handleSendReturnInvoice('sms')}
              disabled={!!sendingInvoice}
              className={cn(
                'flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all',
                'border-charcoal-500 hover:border-blue-500/60 hover:bg-blue-500/10',
                sendingInvoice === 'sms' && 'opacity-60 cursor-wait'
              )}
            >
              <MessageSquare size={28} className="text-blue-400" />
              <div className="text-center">
                <p className="font-medium text-charcoal-50">SMS</p>
                <p className="text-xs text-charcoal-300 mt-0.5">Send via FitSMS</p>
              </div>
            </button>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => setSendInvoiceRentalId(null)}>
            Skip
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
