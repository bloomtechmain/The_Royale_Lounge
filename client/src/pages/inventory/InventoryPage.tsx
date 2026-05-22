import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Package, AlertTriangle, ArrowUp, ArrowDown, RefreshCcw, Edit,
  Tag, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { inventoryService } from '@/services/inventoryService';
import { productService } from '@/services/productService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import StatCard from '@/components/common/StatCard';
import SearchInput from '@/components/common/SearchInput';
import Table from '@/components/common/Table';
import Drawer from '@/components/common/Drawer';
import Input from '@/components/common/Input';
import Pagination from '@/components/common/Pagination';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const MOVEMENT_TYPES = [
  { value: 'in',         label: 'Stock In',    icon: ArrowUp,       color: 'emerald' },
  { value: 'out',        label: 'Stock Out',   icon: ArrowDown,     color: 'red'     },
  { value: 'adjustment', label: 'Adjustment',  icon: RefreshCcw,    color: 'blue'    },
  { value: 'damage',     label: 'Mark Damaged',icon: AlertTriangle, color: 'amber'   },
] as const;

const STOCK_TYPES = [
  { value: 'sale',   label: 'Sale Stock',        icon: Tag,       desc: 'Affects total stock for selling'       },
  { value: 'rental', label: 'Rental Allocation',  icon: RotateCcw, desc: 'Affects units reserved for rental'    },
] as const;

const TYPE_COLORS: Record<string, string> = {
  emerald: 'border-emerald-500 bg-emerald-500/15 text-emerald-400',
  red:     'border-red-500 bg-red-500/15 text-red-400',
  blue:    'border-blue-500 bg-blue-500/15 text-blue-400',
  amber:   'border-amber-500 bg-amber-500/15 text-amber-400',
};
const TYPE_IDLE = 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100';

function getQuantityLabel(type: string, stockType: string) {
  if (type === 'adjustment' && stockType === 'rental') return 'New Rental Allocation';
  if (type === 'adjustment') return 'New Total Stock';
  return 'Quantity';
}

function getQuantityHint(type: string, stockType: string) {
  if (type === 'in'  && stockType === 'rental') return 'Adds to total stock and rental pool';
  if (type === 'in')                            return 'Adds to total stock (sale pool grows)';
  if (type === 'out' && stockType === 'rental') return 'Removes from rental pool and total stock';
  if (type === 'out')                           return 'Removes from total stock (sale side)';
  if (type === 'adjustment' && stockType === 'rental') return 'Sets rental allocation (capped at total stock)';
  if (type === 'adjustment') return 'Sets the exact total stock count';
  if (type === 'damage')     return 'Moves units to damaged, reduces rental pool';
  return '';
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [movement, setMovement] = useState({ type: 'in', stockType: 'sale', quantity: '', reason: '' });

  const { data: summary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: inventoryService.getSummary,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', { search, lowStockOnly, page }],
    queryFn: () => inventoryService.getAll({
      search: search || undefined,
      lowStock: lowStockOnly || undefined,
      page, limit: 30,
    }),
  });

  const { data: categories } = useQuery({ queryKey: ['product-categories'], queryFn: productService.getCategories });

  const recordMutation = useMutation({
    mutationFn: inventoryService.recordMovement,
    onSuccess: () => {
      toast.success('Inventory updated!');
      setShowMovementModal(false);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update inventory'),
  });

  const openMovement = (variant: any) => {
    setSelectedVariant(variant);
    setMovement({ type: 'in', stockType: 'sale', quantity: '', reason: '' });
    setShowMovementModal(true);
  };

  const forSale = selectedVariant
    ? Math.max(0, selectedVariant.stock_quantity - selectedVariant.available_for_rent)
    : 0;

  const columns = [
    {
      key: 'product',
      header: 'Product / Variant',
      render: (item: any) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-charcoal-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            {item.product_image ? <img src={item.product_image} alt="" className="w-full h-full object-cover" /> : <Package size={14} className="text-charcoal-300" />}
          </div>
          <div>
            <p className="text-sm font-medium text-charcoal-50">{item.product_name}</p>
            <p className="text-xs text-charcoal-200">{[item.size, item.color].filter(Boolean).join(' · ') || item.sku}</p>
          </div>
        </div>
      ),
    },
    { key: 'sku', header: 'SKU', render: (item: any) => <code className="text-xs text-gold-500">{item.sku}</code> },
    {
      key: 'stock',
      header: 'Total Stock',
      render: (item: any) => (
        <span className={cn('font-semibold', item.stock_quantity <= 3 ? 'text-red-400' : item.stock_quantity <= 5 ? 'text-amber-400' : 'text-charcoal-50')}>
          {item.stock_quantity}
          {item.stock_quantity <= 3 && <AlertTriangle size={12} className="inline ml-1.5" />}
        </span>
      ),
    },
    {
      key: 'for_sale',
      header: 'For Sale',
      render: (item: any) => {
        const fs = Math.max(0, item.stock_quantity - item.available_for_rent);
        return <span className={cn('font-medium', fs === 0 ? 'text-red-400' : 'text-emerald-400')}>{fs}</span>;
      },
    },
    { key: 'available_for_rent', header: 'For Rent', render: (item: any) => <span className="text-blue-400">{item.available_for_rent}</span> },
    { key: 'damaged', header: 'Damaged', render: (item: any) => <span className={item.damaged_count > 0 ? 'text-red-400' : 'text-charcoal-200'}>{item.damaged_count || 0}</span> },
    {
      key: 'actions',
      header: '',
      render: (item: any) => (
        <Button variant="ghost" icon={<Edit size={13} />} onClick={(e: any) => { e.stopPropagation(); openMovement(item); }}>
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h2 className="page-title">Inventory</h2>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Variants" value={summary?.total_variants || 0} icon={<Package size={18} />} color="gold" />
        <StatCard title="Total Stock" value={summary?.total_stock || 0} icon={<ArrowUp size={18} />} color="blue" />
        <StatCard title="Rented Out" value={summary?.total_available_rent || 0} icon={<ArrowDown size={18} />} color="green" />
        <StatCard title="Low Stock" value={summary?.low_stock_count || 0} icon={<AlertTriangle size={18} />} color={summary?.low_stock_count > 0 ? 'red' : 'green'} />
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search products or SKU..." className="flex-1 min-w-48" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => { setLowStockOnly(e.target.checked); setPage(1); }}
              className="w-4 h-4 accent-gold-600"
            />
            <span className="text-sm text-charcoal-100">Low stock only</span>
          </label>
        </div>
      </Card>

      <Card padding="none">
        <Table
          columns={columns}
          data={data?.data || []}
          loading={isLoading}
          rowKey={(item) => item.id}
          emptyMessage="No inventory items found"
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

      {/* Adjustment Drawer */}
      <Drawer
        open={showMovementModal}
        onClose={() => setShowMovementModal(false)}
        title={selectedVariant ? `Adjust: ${selectedVariant.product_name}` : 'Inventory Movement'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowMovementModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => recordMutation.mutate({
                variantId: selectedVariant?.id,
                type: movement.type,
                stockType: movement.stockType,
                quantity: parseInt(movement.quantity),
                reason: movement.reason,
              })}
              loading={recordMutation.isPending}
              disabled={!movement.quantity}
            >
              Record Movement
            </Button>
          </>
        }
      >
        <div className="space-y-5">

          {/* Item info with stock breakdown */}
          {selectedVariant && (
            <div className="p-3 bg-charcoal-600/50 rounded-xl space-y-2">
              <div>
                <p className="text-sm font-medium text-charcoal-50">{selectedVariant.product_name}</p>
                <p className="text-xs text-charcoal-300">{[selectedVariant.size, selectedVariant.color].filter(Boolean).join(' / ')}</p>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[
                  { label: 'Total',   value: selectedVariant.stock_quantity,      color: 'text-charcoal-50'  },
                  { label: 'Sale',    value: forSale,                              color: 'text-emerald-400'  },
                  { label: 'Rental',  value: selectedVariant.available_for_rent,  color: 'text-blue-400'     },
                  { label: 'Damaged', value: selectedVariant.damaged_count || 0,  color: 'text-red-400'      },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-2 bg-charcoal-700/60 rounded-lg">
                    <p className={cn('text-base font-bold', color)}>{value}</p>
                    <p className="text-[10px] text-charcoal-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Movement Type Tiles */}
          <div>
            <p className="text-sm font-medium text-charcoal-200 mb-2">Movement Type</p>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_TYPES.map(({ value, label, icon: Icon, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMovement({
                    ...movement,
                    type: value,
                    // damage doesn't use stockType, default back to sale when switching away
                    stockType: value === 'damage' ? 'sale' : movement.stockType,
                  })}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                    movement.type === value ? TYPE_COLORS[color] : TYPE_IDLE
                  )}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stock Type Tiles — hidden for damage */}
          {movement.type !== 'damage' && (
            <div>
              <p className="text-sm font-medium text-charcoal-200 mb-2">Stock Type</p>
              <div className="grid grid-cols-2 gap-2">
                {STOCK_TYPES.map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMovement({ ...movement, stockType: value })}
                    className={cn(
                      'flex flex-col items-start gap-1 px-3 py-3 rounded-xl border-2 text-left transition-all',
                      movement.stockType === value
                        ? 'border-gold-500 bg-gold-700/15 text-gold-400'
                        : 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100'
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon size={14} />
                      {label}
                    </span>
                    <span className="text-[10px] leading-tight opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <Input
            label={getQuantityLabel(movement.type, movement.stockType)}
            type="number"
            min="0"
            value={movement.quantity}
            onChange={(e) => setMovement({ ...movement, quantity: e.target.value })}
            placeholder="0"
            hint={getQuantityHint(movement.type, movement.stockType)}
            required
          />

          {/* Reason */}
          <Input
            label="Reason / Notes"
            value={movement.reason}
            onChange={(e) => setMovement({ ...movement, reason: e.target.value })}
            placeholder="Reason for this adjustment..."
          />

        </div>
      </Drawer>
    </div>
  );
}
