import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListKeyNav } from '@/hooks/useListKeyNav';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, List, Columns3,
  CalendarCheck, PackageCheck, PackageOpen, RotateCcw,
  CheckCircle2, AlertTriangle, Clock, Package,
  User, Calendar, ChevronRight,
} from 'lucide-react';
import { rentalService } from '@/services/rentalService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import SearchInput from '@/components/common/SearchInput';
import Select from '@/components/common/Select';
import Table from '@/components/common/Table';
import Pagination from '@/components/common/Pagination';
import { formatCurrency, formatDate, STATUS_LABELS } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import type { Rental } from '@/types';

// ─── Kanban column definitions ────────────────────────────────────────────────
const KANBAN_COLS = [
  {
    key: 'reserved',
    label: 'Reserved',
    icon: CalendarCheck,
    accent: 'border-t-blue-500',
    header: 'bg-blue-500/10',
    count: 'bg-blue-500/20 text-blue-300',
    iconColor: 'text-blue-400',
    cardBorder: 'hover:border-blue-500/40',
    dot: 'bg-blue-500',
    desc: 'Awaiting pickup',
  },
  {
    key: 'ready_for_pickup',
    label: 'Ready',
    icon: PackageCheck,
    accent: 'border-t-purple-500',
    header: 'bg-purple-500/10',
    count: 'bg-purple-500/20 text-purple-300',
    iconColor: 'text-purple-400',
    cardBorder: 'hover:border-purple-500/40',
    dot: 'bg-purple-500',
    desc: 'Items prepared',
  },
  {
    key: 'picked_up',
    label: 'Picked Up',
    icon: PackageOpen,
    accent: 'border-t-amber-500',
    header: 'bg-amber-500/10',
    count: 'bg-amber-500/20 text-amber-300',
    iconColor: 'text-amber-400',
    cardBorder: 'hover:border-amber-500/40',
    dot: 'bg-amber-500',
    desc: 'With customer',
  },
  {
    key: 'late_return',
    label: 'Late Return',
    icon: AlertTriangle,
    accent: 'border-t-red-500',
    header: 'bg-red-500/10',
    count: 'bg-red-500/20 text-red-300',
    iconColor: 'text-red-400',
    cardBorder: 'hover:border-red-500/40',
    dot: 'bg-red-500',
    desc: 'Overdue',
  },
  {
    key: 'returned',
    label: 'Returned',
    icon: RotateCcw,
    accent: 'border-t-green-500',
    header: 'bg-green-500/10',
    count: 'bg-green-500/20 text-green-300',
    iconColor: 'text-green-400',
    cardBorder: 'hover:border-green-500/40',
    dot: 'bg-green-500',
    desc: 'Items received',
  },
  {
    key: 'completed',
    label: 'Completed',
    icon: CheckCircle2,
    accent: 'border-t-emerald-500',
    header: 'bg-emerald-500/10',
    count: 'bg-emerald-500/20 text-emerald-300',
    iconColor: 'text-emerald-400',
    cardBorder: 'hover:border-emerald-500/40',
    dot: 'bg-emerald-500',
    desc: 'Booking closed',
  },
] as const;

const STATUSES = ['reserved', 'ready_for_pickup', 'picked_up', 'returned', 'late_return', 'completed', 'cancelled'];

// ─── Urgency badge helper ─────────────────────────────────────────────────────
function getUrgencyLabel(rental: Rental): { label: string; cls: string } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (rental.status === 'late_return') {
    const end = new Date(rental.rental_end_date);
    const days = Math.ceil((today.getTime() - end.getTime()) / 86400000);
    return { label: `${days}d overdue`, cls: 'bg-red-500/20 text-red-300 border-red-500/30' };
  }

  if (rental.status === 'picked_up') {
    const end = new Date(rental.rental_end_date);
    const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'bg-red-500/20 text-red-300 border-red-500/30' };
    if (diff === 0) return { label: 'Due today',  cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    if (diff === 1) return { label: 'Due tomorrow', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    if (diff <= 3)  return { label: `${diff}d left`, cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    return null;
  }

  if (rental.status === 'reserved' || rental.status === 'ready_for_pickup') {
    const start = new Date(rental.rental_start_date);
    const diff = Math.ceil((start.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return { label: 'Pickup today',    cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
    if (diff === 1) return { label: 'Pickup tomorrow', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    if (diff <= 3)  return { label: `Pickup in ${diff}d`, cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    return null;
  }

  return null;
}

// ─── Kanban card ──────────────────────────────────────────────────────────────
function KanbanCard({ rental, colDef, onClick }: {
  rental: Rental;
  colDef: typeof KANBAN_COLS[number];
  onClick: () => void;
}) {
  const urgency = getUrgencyLabel(rental);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      className={cn(
        'bg-charcoal-700 border border-charcoal-500/60 rounded-xl p-3.5 cursor-pointer',
        'transition-all duration-200 shadow-sm hover:shadow-md',
        colDef.cardBorder,
        'group'
      )}
    >
      {/* Top row: booking number + urgency badge */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <span className="text-xs font-bold text-gold-500 tracking-wide">{rental.booking_number}</span>
        {urgency && (
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md border whitespace-nowrap', urgency.cls)}>
            {urgency.label}
          </span>
        )}
      </div>

      {/* Customer */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-6 h-6 rounded-full bg-gold-700/20 border border-gold-700/30 flex items-center justify-center flex-shrink-0">
          <span className="text-gold-400 text-[10px] font-bold">{(rental.customer_name || '?').charAt(0).toUpperCase()}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-charcoal-50 truncate leading-tight">{rental.customer_name}</p>
          {(rental as any).customer_phone && (
            <p className="text-[11px] text-charcoal-400 truncate">{(rental as any).customer_phone}</p>
          )}
        </div>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-1.5 text-[11px] text-charcoal-300 mb-2.5">
        <Calendar size={10} className="flex-shrink-0" />
        <span>{formatDate(rental.rental_start_date)}</span>
        <ChevronRight size={9} className="text-charcoal-500" />
        <span>{formatDate(rental.rental_end_date)}</span>
      </div>

      {/* Event type if present */}
      {rental.event_type && (
        <div className="mb-2.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-charcoal-600/60 text-charcoal-300 border border-charcoal-500/30">
            {rental.event_type}
          </span>
        </div>
      )}

      {/* Footer: items + amount */}
      <div className="flex items-center justify-between pt-2.5 border-t border-charcoal-600/40">
        <div className="flex items-center gap-1 text-[11px] text-charcoal-400">
          <Package size={10} />
          <span>{(rental as any).item_count ?? 0} item{(rental as any).item_count !== 1 ? 's' : ''}</span>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-charcoal-100">{formatCurrency(rental.total_rental_cost)}</p>
          {Number(rental.total_fine) > 0 && (
            <p className="text-[10px] text-red-400">+{formatCurrency(rental.total_fine)} fine</p>
          )}
        </div>
      </div>

      {/* Hover arrow indicator */}
      <div className="flex justify-end mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight size={12} className={cn('transition-transform group-hover:translate-x-0.5', colDef.iconColor)} />
      </div>
    </motion.div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────
function KanbanColumn({
  col,
  items,
  onCardClick,
}: {
  col: typeof KANBAN_COLS[number];
  items: Rental[];
  onCardClick: (r: Rental) => void;
}) {
  const Icon = col.icon;
  return (
    <div className={cn(
      'flex flex-col rounded-2xl border-t-[3px] border border-charcoal-600/40 bg-charcoal-800/60 min-h-[200px]',
      col.accent
    )}>
      {/* Column header */}
      <div className={cn('flex items-center gap-2 px-3 py-3 rounded-t-xl', col.header)}>
        <div className={cn('p-1.5 rounded-lg bg-charcoal-700/60')}>
          <Icon size={14} className={col.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-charcoal-50 leading-tight">{col.label}</p>
          <p className="text-[10px] text-charcoal-400">{col.desc}</p>
        </div>
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', col.count)}>
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2.5 space-y-2 overflow-y-auto max-h-[calc(100vh-18rem)]">
        <AnimatePresence>
          {items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center mb-2 opacity-30', col.header)}>
                <Icon size={14} className={col.iconColor} />
              </div>
              <p className="text-xs text-charcoal-500">No rentals</p>
            </motion.div>
          ) : (
            items.map((rental) => (
              <KanbanCard
                key={rental.id}
                rental={rental}
                colDef={col}
                onClick={() => onCardClick(rental)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── List view columns ────────────────────────────────────────────────────────
const listColumns = [
  {
    key: 'booking',
    header: 'Booking',
    render: (r: Rental) => (
      <div>
        <p className="font-medium text-gold-500">{r.booking_number}</p>
        {r.event_type && <p className="text-xs text-charcoal-200">{r.event_type}</p>}
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Customer',
    render: (r: Rental) => (
      <div>
        <p className="text-charcoal-50 font-medium">{r.customer_name}</p>
        {(r as any).customer_phone && <p className="text-xs text-charcoal-200">{(r as any).customer_phone}</p>}
      </div>
    ),
  },
  {
    key: 'dates',
    header: 'Period',
    render: (r: Rental) => (
      <div>
        <p className="text-sm">{formatDate(r.rental_start_date)}</p>
        <p className="text-xs text-charcoal-200">→ {formatDate(r.rental_end_date)}</p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (r: Rental) => <Badge status={r.status} />,
  },
  {
    key: 'items',
    header: 'Items',
    render: (r: any) => <span className="text-charcoal-100">{r.item_count || 0}</span>,
  },
  {
    key: 'amount',
    header: 'Total',
    render: (r: Rental) => (
      <div>
        <p className="font-medium text-charcoal-50">{formatCurrency(r.total_rental_cost)}</p>
        {r.total_fine > 0 && <p className="text-xs text-red-400">+{formatCurrency(r.total_fine)} fine</p>}
      </div>
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RentalsPage() {
  const navigate = useNavigate();
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]               = useState(1);
  const [view, setView]               = useState<'list' | 'kanban'>('list');

  // Paginated list query
  const { data, isLoading } = useQuery({
    queryKey: ['rentals', { search, statusFilter, page }],
    queryFn: () => rentalService.getAll({
      search: search || undefined,
      status: statusFilter || undefined,
      page,
      limit: 20,
    }),
  });

  // Kanban needs all active rentals (no pagination)
  const { data: kanbanData } = useQuery({
    queryKey: ['rentals-kanban', { search }],
    queryFn: () => rentalService.getAll({
      search: search || undefined,
      limit: 200,
      page: 1,
    }),
    enabled: view === 'kanban',
    staleTime: 60 * 1000,
  });

  const allRentals: Rental[] = kanbanData?.data || [];
  const rentals: Rental[] = data?.data || [];
  const { searchRef, focusedIndex, handleSearchKeyDown, handleRowKeyDown, setRowRef } = useListKeyNav({
    items: rentals,
    onEnter: useCallback((r: Rental) => navigate(`/rentals/${r.id}`), [navigate]),
  });

  const kanbanCols = KANBAN_COLS.map((col) => ({
    ...col,
    items: allRentals.filter((r) => r.status === col.key),
  }));

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s })),
  ];

  // Stats for kanban header
  const lateCount      = allRentals.filter(r => r.status === 'late_return').length;
  const pickedUpCount  = allRentals.filter(r => r.status === 'picked_up').length;
  const dueTodayCount  = allRentals.filter(r => {
    const today = new Date().toISOString().slice(0, 10);
    return r.status === 'picked_up' && r.rental_end_date.slice(0, 10) === today;
  }).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Rentals</h2>
          <p className="text-charcoal-200 text-sm">{data?.pagination?.total || 0} total rentals</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/rentals/new')}>
          New Rental
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search booking, customer, phone..."
            className="flex-1 min-w-48"
          />
          {view === 'list' && (
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-44"
            />
          )}
          {/* View toggle */}
          <div className="hidden sm:flex rounded-xl border border-charcoal-500/50 overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                view === 'list' ? 'bg-charcoal-600 text-gold-400' : 'text-charcoal-300 hover:text-charcoal-100')}
            >
              <List size={14} /> List
            </button>
            <button
              onClick={() => setView('kanban')}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                view === 'kanban' ? 'bg-charcoal-600 text-gold-400' : 'text-charcoal-300 hover:text-charcoal-100')}
            >
              <Columns3 size={14} /> Kanban
            </button>
          </div>
        </div>
      </Card>

      {/* Kanban alert strip */}
      {view === 'kanban' && (lateCount > 0 || dueTodayCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {lateCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-300">
              <AlertTriangle size={13} />
              <span><strong>{lateCount}</strong> late return{lateCount > 1 ? 's' : ''} — action needed</span>
            </div>
          )}
          {dueTodayCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-900/20 border border-amber-700/30 rounded-xl text-sm text-amber-300">
              <Clock size={13} />
              <span><strong>{dueTodayCount}</strong> rental{dueTodayCount > 1 ? 's' : ''} due today</span>
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <Card padding="none">
          <Table
            columns={listColumns}
            data={rentals}
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/rentals/${r.id}`)}
            emptyMessage="No rentals found"
            focusedIndex={focusedIndex}
            onRowKeyDown={handleRowKeyDown}
            setRowRef={setRowRef}
          />
          {data?.pagination && (
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              limit={data.pagination.limit}
              onPageChange={setPage}
            />
          )}
        </Card>
      )}

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="overflow-x-auto pb-4 -mx-1 px-1">
          <div className="grid grid-cols-6 gap-3 min-w-[900px]">
            {kanbanCols.map((col) => (
              <KanbanColumn
                key={col.key}
                col={col}
                items={col.items}
                onCardClick={(r) => navigate(`/rentals/${r.id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
