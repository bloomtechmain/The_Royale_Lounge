import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Package, CreditCard, Bell, RotateCcw, CheckCircle, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { rentalService } from '@/services/rentalService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import Drawer from '@/components/common/Drawer';
import Select from '@/components/common/Select';
import Input from '@/components/common/Input';
import { formatCurrency, formatDate, formatDateTime, STATUS_LABELS } from '@/utils/formatters';
import type { RentalStatus } from '@/types';

const STATUS_TRANSITIONS: Record<string, string[]> = {
  reserved: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['picked_up', 'cancelled'],
  picked_up: ['returned', 'late_return'],
  late_return: ['returned'],
  returned: ['completed'],
};

export default function RentalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [payment, setPayment] = useState({ amount: '', paymentMethod: 'cash', paymentType: 'balance', notes: '' });

  const { data: rental, isLoading } = useQuery({
    queryKey: ['rental', id],
    queryFn: () => rentalService.getById(id!),
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ status, notes }: { status: string; notes?: string }) =>
      rentalService.updateStatus(id!, status, notes),
    onSuccess: () => {
      toast.success('Status updated!');
      setShowStatusModal(false);
      qc.invalidateQueries({ queryKey: ['rental', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update status'),
  });

  const addPaymentMutation = useMutation({
    mutationFn: (payload: any) => rentalService.addPayment(id!, payload),
    onSuccess: () => {
      toast.success('Payment recorded!');
      setShowPaymentModal(false);
      qc.invalidateQueries({ queryKey: ['rental', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to record payment'),
  });

  if (isLoading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-charcoal-600 rounded-2xl animate-pulse" />)}</div>;
  }
  if (!rental) return <div className="text-charcoal-200">Rental not found.</div>;

  const nextStatuses = STATUS_TRANSITIONS[rental.status] || [];
  const totalPaid = (rental.payments || []).reduce((sum: number, p: any) => {
    return p.payment_type !== 'refund' ? sum + parseFloat(p.amount) : sum - parseFloat(p.amount);
  }, 0);
  const balanceDue = Math.max(0, Number(rental.total_rental_cost) - Number(rental.advance_payment) + Number(rental.total_fine || 0));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => navigate('/rentals')}>Back</Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="page-title">{rental.booking_number}</h2>
            <Badge status={rental.status} />
          </div>
        </div>
        <div className="flex gap-2">
          {nextStatuses.length > 0 && (
            <Button variant="secondary" onClick={() => setShowStatusModal(true)}>
              Update Status
            </Button>
          )}
          <Button variant="primary" icon={<CreditCard size={15} />} onClick={() => setShowPaymentModal(true)}>
            Add Payment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer */}
          <Card>
            <h4 className="text-sm font-semibold text-charcoal-100 mb-3">Customer</h4>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold-700/20 border border-gold-700/30 flex items-center justify-center">
                <span className="text-gold-400 font-semibold">{rental.customer_name?.charAt(0)}</span>
              </div>
              <div>
                <p className="font-semibold text-charcoal-50">{rental.customer_name}</p>
                <div className="flex gap-3 mt-0.5">
                  {rental.customer_phone && <span className="text-xs text-charcoal-200">{rental.customer_phone}</span>}
                  {rental.customer_email && <span className="text-xs text-charcoal-200">{rental.customer_email}</span>}
                </div>
              </div>
              <Button variant="ghost" className="ml-auto" onClick={() => navigate(`/customers/${rental.customer_id}`)}>
                View Profile <ChevronRight size={14} />
              </Button>
            </div>
          </Card>

          {/* Dates */}
          <Card>
            <h4 className="text-sm font-semibold text-charcoal-100 mb-3">Rental Period</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-charcoal-200">Pickup Date</p>
                <p className="font-medium text-charcoal-50 mt-0.5">{formatDate(rental.rental_start_date)}</p>
              </div>
              <div>
                <p className="text-xs text-charcoal-200">Return Date</p>
                <p className="font-medium text-charcoal-50 mt-0.5">{formatDate(rental.rental_end_date)}</p>
              </div>
              {rental.actual_return_date && (
                <div>
                  <p className="text-xs text-charcoal-200">Actual Return</p>
                  <p className="font-medium text-charcoal-50 mt-0.5">{formatDate(rental.actual_return_date)}</p>
                </div>
              )}
            </div>
            {rental.event_type && (
              <div className="mt-3 pt-3 border-t border-charcoal-500">
                <p className="text-xs text-charcoal-200">Event: <span className="text-charcoal-100">{rental.event_type}</span></p>
              </div>
            )}
          </Card>

          {/* Items */}
          <Card>
            <h4 className="text-sm font-semibold text-charcoal-100 mb-3">Rental Items ({rental.items?.length || 0})</h4>
            <div className="space-y-2">
              {rental.items?.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-charcoal-600/40 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-charcoal-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {item.product_image ? <img src={item.product_image} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-charcoal-300" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-charcoal-50">{item.product_name}</p>
                    <p className="text-xs text-charcoal-200">{[item.size, item.color].filter(Boolean).join(' / ')} · {item.variant_sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-charcoal-100">×{item.quantity}</p>
                    <p className="text-xs text-charcoal-200">{formatCurrency(item.rental_price_per_day)}/day</p>
                  </div>
                  <div className="ml-2">
                    <Badge variant={item.is_returned ? 'success' : 'warning'}>{item.is_returned ? 'Returned' : 'Out'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Payments */}
          <Card>
            <h4 className="text-sm font-semibold text-charcoal-100 mb-3">Payments</h4>
            {rental.payments?.length ? (
              <div className="space-y-2">
                {rental.payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-charcoal-600/40 rounded-xl">
                    <div>
                      <p className="text-sm text-charcoal-50 capitalize">{p.payment_type?.replace('_', ' ')}</p>
                      <p className="text-xs text-charcoal-200">{p.payment_method} · {formatDateTime(p.created_at)}</p>
                    </div>
                    <p className={`font-medium ${p.payment_type === 'refund' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {p.payment_type === 'refund' ? '-' : '+'}{formatCurrency(p.amount)}
                    </p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-charcoal-200 text-center py-4">No payments recorded</p>}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Financial Summary */}
          <Card gold>
            <h4 className="text-sm font-semibold text-charcoal-100 mb-3">Financial Summary</h4>
            <div className="space-y-2.5">
              {[
                { label: 'Total Rental Cost', value: formatCurrency(rental.total_rental_cost), color: 'text-charcoal-50' },
                { label: 'Discount', value: rental.discount_amount > 0 ? `-${formatCurrency(rental.discount_amount)}` : '—', color: 'text-emerald-400' },
                { label: 'Advance Paid', value: formatCurrency(rental.advance_payment), color: 'text-emerald-400' },
                ...(Number(rental.total_fine) > 0 ? [{ label: 'Fine', value: formatCurrency(rental.total_fine), color: 'text-red-400' }] : []),
                { label: 'Balance Due', value: formatCurrency(balanceDue), color: balanceDue > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-charcoal-200">{label}</span>
                  <span className={color}>{value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Fines */}
          {(rental.fines?.length ?? 0) > 0 && (
            <Card>
              <h4 className="text-sm font-semibold text-red-400 mb-3">Late Fines</h4>
              {rental.fines?.map((fine: any) => (
                <div key={fine.id} className="text-sm">
                  <p className="text-charcoal-50">{fine.days_late} days overdue</p>
                  <p className="text-charcoal-200">{formatCurrency(fine.fine_per_day)}/day × {fine.days_late} = {formatCurrency(fine.total_fine)}</p>
                  <Badge variant={fine.is_paid ? 'success' : 'error'} className="mt-1">
                    {fine.is_paid ? 'Paid' : 'Unpaid'}
                  </Badge>
                </div>
              ))}
            </Card>
          )}

          {/* Actions */}
          <Card>
            <h4 className="text-sm font-semibold text-charcoal-100 mb-3">Actions</h4>
            <div className="space-y-2">
              {rental.status === 'picked_up' || rental.status === 'late_return' ? (
                <Button variant="secondary" className="w-full" icon={<RotateCcw size={14} />} onClick={() => navigate(`/returns?rental=${id}`)}>
                  Process Return
                </Button>
              ) : null}
              <Button variant="ghost" className="w-full" icon={<Bell size={14} />}>
                Send Reminder
              </Button>
            </div>
          </Card>

          {/* Notes */}
          {rental.notes && (
            <Card>
              <h4 className="text-sm font-semibold text-charcoal-100 mb-2">Notes</h4>
              <p className="text-sm text-charcoal-200">{rental.notes}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Status Modal */}
      <Drawer
        open={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Update Rental Status"
       
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowStatusModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => updateStatusMutation.mutate({ status: newStatus, notes: statusNotes })}
              loading={updateStatusMutation.isPending}
              disabled={!newStatus}
            >
              Update Status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-charcoal-200">Current status: <Badge status={rental.status} /></p>
          <Select
            label="New Status"
            options={[
              { value: '', label: 'Select new status' },
              ...nextStatuses.map((s) => ({ value: s, label: STATUS_LABELS[s] || s })),
            ]}
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
          />
          <Input
            label="Notes (optional)"
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            placeholder="Any notes about this status change..."
          />
        </div>
      </Drawer>

      {/* Payment Modal */}
      <Drawer
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Add Payment"
       
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => addPaymentMutation.mutate({ ...payment, amount: parseFloat(payment.amount) })}
              loading={addPaymentMutation.isPending}
              disabled={!payment.amount}
            >
              Record Payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Amount (LKR)" type="number" step="0.01" min="0" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} placeholder="0.00" required />
          <Select
            label="Payment Method"
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
              { value: 'mobile_payment', label: 'Mobile Payment' },
              { value: 'bank_transfer', label: 'Bank Transfer' },
            ]}
            value={payment.paymentMethod}
            onChange={(e) => setPayment({ ...payment, paymentMethod: e.target.value })}
          />
          <Select
            label="Payment Type"
            options={[
              { value: 'balance', label: 'Balance' },
              { value: 'advance', label: 'Advance' },
              { value: 'fine', label: 'Fine' },
              { value: 'refund', label: 'Refund' },
            ]}
            value={payment.paymentType}
            onChange={(e) => setPayment({ ...payment, paymentType: e.target.value })}
          />
          <Input label="Notes" value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} placeholder="Optional notes..." />
        </div>
      </Drawer>
    </div>
  );
}
