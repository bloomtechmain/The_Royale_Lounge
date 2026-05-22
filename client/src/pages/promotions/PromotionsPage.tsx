import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Percent, Plus, Pencil, Trash2, Eye, EyeOff,
  Tag, TrendingDown, Clock, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { promotionService, getPromoDiscountLabel } from '@/services/promotionService';
import { productService } from '@/services/productService';
import { usePermissions } from '@/hooks/usePermissions';
import type { Promotion, PromotionType, PromotionScope } from '@/types';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import StatCard from '@/components/common/StatCard';
import Modal from '@/components/common/Modal';
import Badge from '@/components/common/Badge';
import EmptyState from '@/components/common/EmptyState';
import { cn } from '@/utils/cn';

// ─── Types ────────────────────────────────────────────────────────────────────
type ScopeFilter  = 'all' | 'pos' | 'rental' | 'both';
type StatusFilter = 'all' | 'active' | 'inactive' | 'expired';

interface PromoForm {
  name: string;
  description: string;
  type: PromotionType | '';
  scope: PromotionScope;
  percentage_value: string;
  flat_amount_value: string;
  buy_quantity: string;
  get_quantity: string;
  free_variant_id: string;
  free_variant_label: string;
  min_order_amount: string;
  max_usage_count: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

const EMPTY_FORM: PromoForm = {
  name: '', description: '', type: '', scope: 'both',
  percentage_value: '', flat_amount_value: '',
  buy_quantity: '', get_quantity: '',
  free_variant_id: '', free_variant_label: '',
  min_order_amount: '', max_usage_count: '',
  start_date: '', end_date: '', is_active: true,
};

// ─── Badge helpers ────────────────────────────────────────────────────────────
const TYPE_BADGE: Record<PromotionType, { label: string; color: string }> = {
  percentage:  { label: 'Percentage',  color: 'text-gold-400 bg-gold-700/20 border border-gold-700/30' },
  flat_amount: { label: 'Flat Amount', color: 'text-blue-400 bg-blue-900/20 border border-blue-700/30' },
  buy_x_get_y: { label: 'Buy X Get Y', color: 'text-purple-400 bg-purple-900/20 border border-purple-700/30' },
  free_item:   { label: 'Free Item',   color: 'text-emerald-400 bg-emerald-900/20 border border-emerald-700/30' },
};

const SCOPE_BADGE: Record<PromotionScope, string> = {
  pos:    'text-sky-400 bg-sky-900/20 border border-sky-700/30',
  rental: 'text-violet-400 bg-violet-900/20 border border-violet-700/30',
  both:   'text-charcoal-200 bg-charcoal-600/30 border border-charcoal-500/30',
};

function isExpired(p: Promotion) {
  return new Date(p.end_date) < new Date(new Date().toISOString().slice(0, 10));
}
function isExpiringSoon(p: Promotion) {
  const diff = (new Date(p.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PromotionsPage() {
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('promotions', 'write');

  const [scopeFilter,  setScopeFilter]  = useState<ScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromoForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [variantSearch, setVariantSearch] = useState('');
  const [variantResults, setVariantResults] = useState<any[]>([]);

  const { data: promotions = [], isLoading } = useQuery({
    queryKey: ['promotions'],
    queryFn: promotionService.getAll,
    staleTime: 2 * 60 * 1000,
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const activeCount   = promotions.filter(p => p.is_active && !isExpired(p)).length;
  const totalUsed     = promotions.reduce((s, p) => s + (p.usage_count || 0), 0);
  const expiringSoon  = promotions.filter(p => p.is_active && isExpiringSoon(p)).length;

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return promotions.filter(p => {
      if (scopeFilter !== 'all' && p.scope !== scopeFilter) return false;
      if (statusFilter === 'active')   return p.is_active && !isExpired(p);
      if (statusFilter === 'inactive') return !p.is_active;
      if (statusFilter === 'expired')  return isExpired(p);
      return true;
    });
  }, [promotions, scopeFilter, statusFilter]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['promotions'] });
    qc.invalidateQueries({ queryKey: ['promotions-active'] });
  };

  const createMut = useMutation({
    mutationFn: promotionService.create,
    onSuccess: () => { toast.success('Promotion created!'); invalidateAll(); closeForm(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create promotion'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => promotionService.update(id, payload),
    onSuccess: () => { toast.success('Promotion updated!'); invalidateAll(); closeForm(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update promotion'),
  });
  const toggleMut = useMutation({
    mutationFn: promotionService.toggle,
    onSuccess: () => invalidateAll(),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to toggle promotion'),
  });
  const deleteMut = useMutation({
    mutationFn: promotionService.delete,
    onSuccess: () => { toast.success('Promotion removed'); invalidateAll(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete promotion'),
  });

  // ── Form helpers ───────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setVariantSearch('');
    setVariantResults([]);
    setShowForm(true);
  }
  function openEdit(p: Promotion) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description ?? '',
      type: p.type,
      scope: p.scope,
      percentage_value:  p.percentage_value  != null ? String(p.percentage_value)  : '',
      flat_amount_value: p.flat_amount_value != null ? String(p.flat_amount_value) : '',
      buy_quantity:      p.buy_quantity      != null ? String(p.buy_quantity)      : '',
      get_quantity:      p.get_quantity      != null ? String(p.get_quantity)      : '',
      free_variant_id:   p.free_variant_id   ?? '',
      free_variant_label: p.free_variant_id
        ? `${p.free_product_name ?? ''} ${p.free_variant_size ?? ''} ${p.free_variant_color ?? ''}`.trim()
        : '',
      min_order_amount: p.min_order_amount != null ? String(p.min_order_amount) : '',
      max_usage_count:  p.max_usage_count  != null ? String(p.max_usage_count)  : '',
      start_date: p.start_date.slice(0, 10),
      end_date:   p.end_date.slice(0, 10),
      is_active: p.is_active,
    });
    setFormError('');
    setVariantSearch('');
    setVariantResults([]);
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }
  function setField(key: keyof PromoForm, value: any) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleVariantSearch(q: string) {
    setVariantSearch(q);
    if (q.length < 2) { setVariantResults([]); return; }
    const res = await productService.getAll({ search: q, limit: 20 });
    const variants: any[] = [];
    for (const p of (res.data ?? [])) {
      for (const v of (p.variants ?? [])) {
        variants.push({
          id: v.id,
          label: `${p.name} — ${[v.size, v.color].filter(Boolean).join(' / ')} (${v.sku})`,
        });
      }
    }
    setVariantResults(variants);
  }

  function validateForm(): string | null {
    if (!form.name.trim())  return 'Name is required';
    if (!form.type)         return 'Promotion type is required';
    if (!form.start_date)   return 'Start date is required';
    if (!form.end_date)     return 'End date is required';
    if (form.start_date > form.end_date) return 'Start date must be before end date';
    if (form.type === 'percentage') {
      const v = parseFloat(form.percentage_value);
      if (isNaN(v) || v <= 0 || v > 100) return 'Percentage must be between 0.01 and 100';
    }
    if (form.type === 'flat_amount') {
      if (!form.flat_amount_value || parseFloat(form.flat_amount_value) <= 0)
        return 'Discount amount must be greater than 0';
    }
    if (form.type === 'buy_x_get_y') {
      if (!form.buy_quantity || parseInt(form.buy_quantity) <= 0) return 'Buy quantity must be greater than 0';
      if (!form.get_quantity || parseInt(form.get_quantity) <= 0) return 'Get quantity must be greater than 0';
    }
    if (form.type === 'free_item' && !form.free_variant_id)
      return 'Please select a product variant for the free item';
    return null;
  }

  function handleSubmit() {
    const err = validateForm();
    if (err) { setFormError(err); return; }

    const payload: any = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      scope: form.scope,
      start_date: form.start_date,
      end_date: form.end_date,
      is_active: form.is_active,
      min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : null,
      max_usage_count:  form.max_usage_count  ? parseInt(form.max_usage_count)   : null,
    };
    if (form.type === 'percentage')  payload.percentage_value  = parseFloat(form.percentage_value);
    if (form.type === 'flat_amount') payload.flat_amount_value = parseFloat(form.flat_amount_value);
    if (form.type === 'buy_x_get_y') {
      payload.buy_quantity = parseInt(form.buy_quantity);
      payload.get_quantity = parseInt(form.get_quantity);
    }
    if (form.type === 'free_item') payload.free_variant_id = form.free_variant_id;

    if (editingId) {
      updateMut.mutate({ id: editingId, payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Promotions</h1>
          <p className="text-charcoal-300 text-sm mt-0.5">Create and manage discount promotions for POS and Rentals</p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="btn-gold flex items-center gap-2">
            <Plus size={16} /> New Promotion
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Active Promotions" value={activeCount} icon={<Percent size={20} />} color="gold" loading={isLoading} />
        <StatCard title="Total Used" value={totalUsed} icon={<TrendingDown size={20} />} color="blue" loading={isLoading} />
        <StatCard title="Expiring Soon (7 days)" value={expiringSoon} icon={<Clock size={20} />} color={expiringSoon > 0 ? 'red' : 'green'} loading={isLoading} />
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4">
          <FilterTabs
            label="Scope"
            options={[
              { key: 'all', label: 'All' },
              { key: 'pos', label: 'POS' },
              { key: 'rental', label: 'Rental' },
              { key: 'both', label: 'Both' },
            ]}
            active={scopeFilter}
            onChange={(v) => setScopeFilter(v as ScopeFilter)}
          />
          <FilterTabs
            label="Status"
            options={[
              { key: 'all', label: 'All' },
              { key: 'active', label: 'Active' },
              { key: 'inactive', label: 'Inactive' },
              { key: 'expired', label: 'Expired' },
            ]}
            active={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-charcoal-600/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Tag size={32} className="text-charcoal-400" />}
            title="No promotions found"
            description={canWrite ? 'Create your first promotion to get started' : 'No promotions match the current filters'}
            action={canWrite ? { label: 'New Promotion', onClick: openCreate } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal-600/30">
                  {['Name', 'Type', 'Scope', 'Discount', 'Validity', 'Usage', 'Status', ''].map(h => (
                    <th key={h} className="text-left py-3 px-3 text-charcoal-300 font-medium text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const expired = isExpired(p);
                  const tb = TYPE_BADGE[p.type];
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-charcoal-600/20 hover:bg-charcoal-600/10 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <p className="font-medium text-charcoal-50">{p.name}</p>
                        {p.description && <p className="text-xs text-charcoal-400 mt-0.5 line-clamp-1">{p.description}</p>}
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn('text-xs px-2 py-1 rounded-lg font-medium', tb.color)}>{tb.label}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn('text-xs px-2 py-1 rounded-lg font-medium capitalize', SCOPE_BADGE[p.scope])}>{p.scope}</span>
                      </td>
                      <td className="py-3 px-3 text-charcoal-100">{getPromoDiscountLabel(p)}</td>
                      <td className="py-3 px-3 text-charcoal-200 whitespace-nowrap">
                        {formatDate(p.start_date)} — {formatDate(p.end_date)}
                      </td>
                      <td className="py-3 px-3 text-charcoal-200">
                        {p.usage_count} / {p.max_usage_count ?? '∞'}
                      </td>
                      <td className="py-3 px-3">
                        {expired ? (
                          <span className="text-xs px-2 py-1 rounded-lg font-medium text-charcoal-400 bg-charcoal-600/30 border border-charcoal-500/30">Expired</span>
                        ) : p.is_active ? (
                          <span className="text-xs px-2 py-1 rounded-lg font-medium text-emerald-400 bg-emerald-900/20 border border-emerald-700/30">Active</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-lg font-medium text-charcoal-300 bg-charcoal-600/30 border border-charcoal-500/30">Inactive</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {canWrite && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="p-1.5 rounded-lg text-charcoal-300 hover:text-gold-400 hover:bg-gold-700/10 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => toggleMut.mutate(p.id)}
                              className="p-1.5 rounded-lg text-charcoal-300 hover:text-sky-400 hover:bg-sky-900/10 transition-colors"
                              title={p.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {p.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Remove this promotion?')) deleteMut.mutate(p.id);
                              }}
                              className="p-1.5 rounded-lg text-charcoal-300 hover:text-red-400 hover:bg-red-900/10 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Form Modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Edit Promotion' : 'New Promotion'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="btn-gold">
              {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Promotion'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-sm text-red-400">
              <AlertCircle size={14} />
              {formError}
            </div>
          )}

          <Input label="Name" required value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Summer Sale 20% Off" />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-charcoal-100">Description</label>
            <textarea
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              rows={2}
              placeholder="Optional description…"
              className="input-dark resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              required
              value={form.type}
              onChange={e => { setField('type', e.target.value); setField('free_variant_id', ''); setField('free_variant_label', ''); }}
              options={[
                { value: 'percentage',  label: 'Percentage Off' },
                { value: 'flat_amount', label: 'Flat Amount Off' },
                { value: 'buy_x_get_y', label: 'Buy X Get Y Free' },
                { value: 'free_item',   label: 'Free Item / Gift' },
              ]}
              placeholder="Select type…"
              disabled={!!editingId}
            />
            <Select
              label="Applies To"
              required
              value={form.scope}
              onChange={e => setField('scope', e.target.value as PromotionScope)}
              options={[
                { value: 'both',   label: 'POS & Rentals' },
                { value: 'pos',    label: 'POS Only' },
                { value: 'rental', label: 'Rentals Only' },
              ]}
            />
          </div>

          {/* Type-specific fields */}
          {form.type === 'percentage' && (
            <Input
              label="Discount %"
              required
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={form.percentage_value}
              onChange={e => setField('percentage_value', e.target.value)}
              placeholder="e.g. 15"
            />
          )}

          {form.type === 'flat_amount' && (
            <Input
              label="Discount Amount (LKR)"
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.flat_amount_value}
              onChange={e => setField('flat_amount_value', e.target.value)}
              placeholder="e.g. 500"
            />
          )}

          {form.type === 'buy_x_get_y' && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Buy Quantity"
                required
                type="number"
                min="1"
                value={form.buy_quantity}
                onChange={e => setField('buy_quantity', e.target.value)}
                placeholder="e.g. 3"
              />
              <Input
                label="Get Free Quantity"
                required
                type="number"
                min="1"
                value={form.get_quantity}
                onChange={e => setField('get_quantity', e.target.value)}
                placeholder="e.g. 1"
              />
            </div>
          )}

          {form.type === 'free_item' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-charcoal-100">
                Free Product Variant <span className="text-gold-600 ml-1">*</span>
              </label>
              <input
                className="input-dark w-full"
                placeholder="Search product name or SKU…"
                value={variantSearch || form.free_variant_label}
                onChange={e => handleVariantSearch(e.target.value)}
              />
              {variantResults.length > 0 && (
                <div className="bg-charcoal-700 border border-charcoal-500/50 rounded-xl overflow-hidden shadow-lg">
                  {variantResults.map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setField('free_variant_id', v.id);
                        setField('free_variant_label', v.label);
                        setVariantSearch('');
                        setVariantResults([]);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-charcoal-100 hover:bg-charcoal-600 transition-colors"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
              {form.free_variant_id && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-900/20 border border-emerald-700/30 rounded-xl text-sm text-emerald-300">
                  <Tag size={12} />
                  {form.free_variant_label}
                  <button
                    type="button"
                    onClick={() => { setField('free_variant_id', ''); setField('free_variant_label', ''); }}
                    className="ml-auto text-charcoal-400 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" required type="date" value={form.start_date} onChange={e => setField('start_date', e.target.value)} />
            <Input label="End Date"   required type="date" value={form.end_date}   onChange={e => setField('end_date',   e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min. Order Amount (LKR)"
              type="number"
              min="0"
              step="0.01"
              value={form.min_order_amount}
              onChange={e => setField('min_order_amount', e.target.value)}
              placeholder="No minimum"
            />
            <Input
              label="Max Usage Count"
              type="number"
              min="1"
              value={form.max_usage_count}
              onChange={e => setField('max_usage_count', e.target.value)}
              placeholder="Unlimited"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <input
              id="is_active"
              type="checkbox"
              checked={form.is_active}
              onChange={e => setField('is_active', e.target.checked)}
              className="w-4 h-4 accent-gold-500 rounded"
            />
            <label htmlFor="is_active" className="text-sm text-charcoal-100 cursor-pointer">
              Active (visible to cashiers)
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Filter tabs helper ───────────────────────────────────────────────────────
function FilterTabs({
  label,
  options,
  active,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-charcoal-400 font-medium">{label}:</span>
      <div className="flex rounded-xl overflow-hidden border border-charcoal-600/40">
        {options.map(o => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              active === o.key
                ? 'bg-gold-700/30 text-gold-400'
                : 'text-charcoal-300 hover:text-charcoal-100 hover:bg-charcoal-600/30'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
