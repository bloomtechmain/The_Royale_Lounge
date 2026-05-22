import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListKeyNav } from '@/hooks/useListKeyNav';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Package, Grid, List, Tag, Barcode } from 'lucide-react';
import { toast } from 'sonner';
import { productService } from '@/services/productService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import SearchInput from '@/components/common/SearchInput';
import Select from '@/components/common/Select';
import Table from '@/components/common/Table';
import Pagination from '@/components/common/Pagination';
import EmptyState from '@/components/common/EmptyState';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import type { Product, ProductCategory } from '@/types';

const TYPE_LABELS: Record<string, string> = { rental: 'Rental', sale: 'Sale', both: 'Both' };
const TYPE_COLORS: Record<string, string> = {
  rental: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  sale: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  both: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

export default function ProductsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['products', { search, categoryFilter, typeFilter, page }],
    queryFn: () => productService.getAll({
      search: search || undefined,
      category: categoryFilter || undefined,
      type: typeFilter || undefined,
      page,
      limit: 24,
    }),
  });

  const products = data?.data || [];
  const { searchRef, focusedIndex, handleSearchKeyDown, handleRowKeyDown, setRowRef } = useListKeyNav({
    items: products,
    onEnter: useCallback((p: Product) => navigate(`/products/${p.id}`), [navigate]),
  });

  const { data: categories } = useQuery({
    queryKey: ['product-categories'],
    queryFn: productService.getCategories,
  });

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...(categories || []).map((c: ProductCategory) => ({ value: c.id, label: c.name })),
  ];

  const typeOptions = [
    { value: '', label: 'All Types' },
    { value: 'rental', label: 'Rental Only' },
    { value: 'sale', label: 'Sale Only' },
    { value: 'both', label: 'Both' },
  ];

  const columns = [
    {
      key: 'name',
      header: 'Product',
      render: (p: Product) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-charcoal-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            {p.primary_image ? (
              <img src={p.primary_image} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <Package size={16} className="text-charcoal-200" />
            )}
          </div>
          <div>
            <p className="font-medium text-charcoal-50">{p.name}</p>
            <p className="text-xs text-charcoal-200">{p.sku}</p>
          </div>
        </div>
      ),
    },
    { key: 'category_name', header: 'Category', render: (p: Product) => p.category_name || '—' },
    {
      key: 'type',
      header: 'Type',
      render: (p: Product) => (
        <span className={cn('badge-status border text-xs px-2 py-0.5', TYPE_COLORS[p.type])}>
          {TYPE_LABELS[p.type]}
        </span>
      ),
    },
    {
      key: 'pricing',
      header: 'Pricing',
      render: (p: Product) => (
        <div>
          {p.selling_price && <p className="text-sm">{formatCurrency(p.selling_price)}</p>}
          {p.rental_price_per_day && <p className="text-xs text-charcoal-200">{formatCurrency(p.rental_price_per_day)}/day</p>}
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (p: Product) => (
        <div>
          <span className={cn('font-medium', (p.total_stock ?? 0) <= 3 ? 'text-red-400' : 'text-charcoal-50')}>
            {p.total_stock ?? 0}
          </span>
          {p.total_available !== undefined && p.total_available > 0 && (
            <span className="text-xs text-charcoal-200 ml-1">({p.total_available} avail)</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p: Product) => (
        <Badge variant={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <h2 className="page-title">Products</h2>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/products/new')}>
          Add Product
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
            placeholder="Search by name, SKU, or barcode..."
            className="flex-1 min-w-48"
          />
          <Select
            options={categoryOptions}
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="w-44"
          />
          <Select
            options={typeOptions}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="w-36"
          />
          <div className="flex rounded-xl border border-charcoal-400 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-2.5 transition-colors', viewMode === 'grid' ? 'bg-charcoal-500 text-gold-400' : 'text-charcoal-200 hover:text-charcoal-50')}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-2.5 transition-colors', viewMode === 'list' ? 'bg-charcoal-500 text-gold-400' : 'text-charcoal-200 hover:text-charcoal-50')}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </Card>

      {/* Content */}
      <Card padding="none">
        {viewMode === 'grid' ? (
          <div className="p-5">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-square bg-charcoal-600 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !data?.data?.length ? (
              <EmptyState
                icon={<Package size={24} />}
                title="No products yet"
                description="Start by adding your first product to the catalog"
                action={{ label: 'Add Product', onClick: () => navigate('/products/new') }}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {data.data.map((product) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-charcoal-600/50 border border-charcoal-500 rounded-xl overflow-hidden cursor-pointer hover:border-gold-700/40 hover:shadow-gold transition-all duration-200 group"
                    onClick={() => navigate(`/products/${product.id}`)}
                  >
                    <div className="aspect-square bg-charcoal-600 flex items-center justify-center overflow-hidden">
                      {product.primary_image ? (
                        <img src={product.primary_image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <Package size={28} className="text-charcoal-300" />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-charcoal-50 truncate">{product.name}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className={cn('text-xs badge-status border', TYPE_COLORS[product.type])}>
                          {TYPE_LABELS[product.type]}
                        </span>
                        <span className={cn('text-xs font-medium', (product.total_stock ?? 0) <= 3 ? 'text-red-400' : 'text-charcoal-200')}>
                          {product.total_stock ?? 0} pcs
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Table
            columns={columns}
            data={products}
            loading={isLoading}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/products/${p.id}`)}
            emptyMessage="No products found"
            focusedIndex={focusedIndex}
            onRowKeyDown={handleRowKeyDown}
            setRowRef={setRowRef}
          />
        )}

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
    </div>
  );
}
