import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Package, AlertTriangle, ArrowUp, ArrowDown, RefreshCcw, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryService } from '@/services/inventoryService';
import { productService } from '@/services/productService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import StatCard from '@/components/common/StatCard';
import SearchInput from '@/components/common/SearchInput';
import Select from '@/components/common/Select';
import Table from '@/components/common/Table';
import Drawer from '@/components/common/Drawer';
import Input from '@/components/common/Input';
import Pagination from '@/components/common/Pagination';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const MOVEMENT_TYPES = [
  { value: 'in', label: 'Stock In' },
  { value: 'out', label: 'Stock Out' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'damage', label: 'Mark Damaged' },
];

export default function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [movement, setMovement] = useState({ type: 'in', quantity: '', reason: '' });

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
    setMovement({ type: 'in', quantity: '', reason: '' });
    setShowMovementModal(true);
  };

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
    { key: 'available_for_rent', header: 'Available', render: (item: any) => <span className="text-blue-400">{item.available_for_rent}</span> },
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
        <div className="space-y-4">
          {selectedVariant && (
            <div className="p-3 bg-charcoal-600/50 rounded-xl text-sm">
              <p className="text-charcoal-50 font-medium">{selectedVariant.product_name}</p>
              <p className="text-charcoal-200">{[selectedVariant.size, selectedVariant.color].filter(Boolean).join(' / ')}</p>
              <p className="text-charcoal-200 mt-1">Current stock: <span className="text-charcoal-50 font-medium">{selectedVariant.stock_quantity}</span></p>
            </div>
          )}
          <Select label="Movement Type" options={MOVEMENT_TYPES} value={movement.type} onChange={(e) => setMovement({ ...movement, type: e.target.value })} />
          <Input
            label={movement.type === 'adjustment' ? 'New Stock Quantity' : 'Quantity'}
            type="number"
            min="1"
            value={movement.quantity}
            onChange={(e) => setMovement({ ...movement, quantity: e.target.value })}
            placeholder="0"
            required
          />
          <Input label="Reason / Notes" value={movement.reason} onChange={(e) => setMovement({ ...movement, reason: e.target.value })} placeholder="Reason for this adjustment..." />
        </div>
      </Drawer>
    </div>
  );
}
