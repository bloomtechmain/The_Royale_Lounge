import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { RotateCcw, AlertTriangle, CheckCircle, Package, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { returnService } from '@/services/returnService';
import { rentalService } from '@/services/rentalService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import Drawer from '@/components/common/Drawer';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import Table from '@/components/common/Table';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/utils/cn';

export default function ReturnsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedRental, setSelectedRental] = useState<any>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [itemConditions, setItemConditions] = useState<Record<string, string>>({});
  const [fineCalc, setFineCalc] = useState<any>(null);

  const { data: pendingReturns, isLoading } = useQuery({
    queryKey: ['pending-returns'],
    queryFn: returnService.getPending,
    refetchInterval: 60_000,
  });

  const processReturnMutation = useMutation({
    mutationFn: ({ rentalId, payload }: { rentalId: string; payload: any }) =>
      returnService.processReturn(rentalId, payload),
    onSuccess: (data) => {
      toast.success('Return processed successfully!');
      if (data.fine?.totalFine > 0) {
        toast.error(`Fine collected: ${formatCurrency(data.fine.totalFine)}`);
      }
      setShowReturnModal(false);
      setSelectedRental(null);
      qc.invalidateQueries({ queryKey: ['pending-returns'] });
      qc.invalidateQueries({ queryKey: ['rentals'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to process return'),
  });

  const openReturnModal = async (rental: any) => {
    setSelectedRental(rental);
    const conditions: Record<string, string> = {};
    // We need to fetch full rental details for items
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

    // Pre-calculate fine
    try {
      const fine = await returnService.getFineCalc(rental.id, returnDate);
      setFineCalc(fine);
    } catch {
      setFineCalc(null);
    }
    setShowReturnModal(true);
  };

  const handleProcessReturn = () => {
    if (!selectedRental) return;
    const items = Object.entries(itemConditions).map(([id, condition]) => ({
      rentalItemId: id,
      condition,
      quantity: 1,
    }));
    processReturnMutation.mutate({
      rentalId: selectedRental.id,
      payload: { items, returnDate, paymentMethod, collectFine: true },
    });
  };

  const overdueReturns = (pendingReturns || []).filter((r: any) => parseInt(r.days_overdue) > 0);
  const todayReturns = (pendingReturns || []).filter((r: any) => parseInt(r.days_overdue) === 0);

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
        <Button variant="primary" icon={<RotateCcw size={13} />} onClick={(e: any) => { e.stopPropagation(); openReturnModal(r); }}>
          Process
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h2 className="page-title">Returns & Fines</h2>
        <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => qc.invalidateQueries({ queryKey: ['pending-returns'] })}>
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="p-3 bg-amber-500/15 rounded-xl text-amber-400">
            <Clock size={20} />
          </div>
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
          <div className="p-3 bg-green-500/15 rounded-xl text-green-400">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="text-2xl font-semibold text-charcoal-50">{pendingReturns?.length || 0}</p>
            <p className="text-xs text-charcoal-200">Total Pending</p>
          </div>
        </Card>
      </div>

      {/* Overdue alert */}
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

      {/* Return Modal */}
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
          {/* Item conditions */}
          <div>
            <h4 className="text-sm font-semibold text-charcoal-100 mb-3">Item Conditions</h4>
            <div className="space-y-2">
              {(selectedRental?.items || []).filter((i: any) => !i.is_returned).map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-charcoal-600/40 rounded-xl">
                  <Package size={16} className="text-charcoal-300 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-charcoal-50">{item.product_name}</p>
                    <p className="text-xs text-charcoal-200">{[item.size, item.color].filter(Boolean).join(' / ')}</p>
                  </div>
                  <Select
                    options={[
                      { value: 'good', label: 'Good' },
                      { value: 'damaged', label: 'Damaged' },
                      { value: 'lost', label: 'Lost' },
                    ]}
                    value={itemConditions[item.id] || 'good'}
                    onChange={(e) => setItemConditions({ ...itemConditions, [item.id]: e.target.value })}
                    className="w-full sm:w-32"
                  />
                </div>
              ))}
              {(selectedRental?.items || []).filter((i: any) => !i.is_returned).length === 0 && (
                <p className="text-sm text-charcoal-200 text-center py-3">All items already returned</p>
              )}
            </div>
          </div>

          {/* Return date and fine */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Return Date"
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />
            <Select
              label="Payment Method (Fine)"
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'card', label: 'Card' },
                { value: 'mobile_payment', label: 'Mobile Payment' },
              ]}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
          </div>

          {/* Fine calculation */}
          {fineCalc && (
            <div className={cn('p-4 rounded-xl', fineCalc.totalFine > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20')}>
              {fineCalc.totalFine > 0 ? (
                <>
                  <p className="font-semibold text-red-300 mb-2">Late Return Fine</p>
                  <div className="space-y-1 text-sm text-charcoal-200">
                    <p>Days late: <span className="text-red-400 font-medium">{fineCalc.daysLate}</span></p>
                    <p>Fine/day: <span className="text-red-400 font-medium">{formatCurrency(fineCalc.finePerDay)}</span></p>
                    <p className="text-base font-semibold text-red-300 mt-2">Total fine: {formatCurrency(fineCalc.totalFine)}</p>
                  </div>
                </>
              ) : (
                <p className="text-emerald-400 font-medium">✓ Returned on time — no fine</p>
              )}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
