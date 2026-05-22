import { Tag, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  promotionService,
  calculatePromoDiscount,
  getPromoDiscountLabel,
} from '@/services/promotionService';
import type { Promotion } from '@/types';

interface PromotionSelectorProps {
  scope: 'pos' | 'rental';
  cartSubtotal: number;
  cartItems: { unitPrice: number; quantity: number }[];
  rentalDays?: number;
  selectedId: string | null;
  onSelect: (promo: Promotion | null) => void;
}

export default function PromotionSelector({
  scope,
  cartSubtotal,
  cartItems,
  rentalDays = 1,
  selectedId,
  onSelect,
}: PromotionSelectorProps) {
  const { data: promos = [], isLoading } = useQuery({
    queryKey: ['promotions-active', scope],
    queryFn: () => promotionService.getActive(scope),
    staleTime: 2 * 60 * 1000,
  });

  // Filter out promos that don't meet min_order_amount
  const eligible = promos.filter(
    (p) => !p.min_order_amount || cartSubtotal >= p.min_order_amount
  );

  const selected = eligible.find((p) => p.id === selectedId) ?? null;

  const previewDiscount = selected
    ? calculatePromoDiscount(selected, cartSubtotal, cartItems, rentalDays, scope)
    : 0;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(n);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) {
      onSelect(null);
    } else {
      const promo = eligible.find((p) => p.id === id) ?? null;
      onSelect(promo);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-charcoal-100">
        Promotion <span className="text-charcoal-300 font-normal">(optional)</span>
      </label>

      <select
        value={selectedId ?? ''}
        onChange={handleChange}
        disabled={isLoading || eligible.length === 0}
        className="input-dark w-full appearance-none"
      >
        <option value="">— No promotion —</option>
        {eligible.map((p) => (
          <option key={p.id} value={p.id} className="bg-charcoal-600">
            {p.name} — {getPromoDiscountLabel(p)}
          </option>
        ))}
      </select>

      {eligible.length === 0 && !isLoading && (
        <p className="text-xs text-charcoal-400">No active promotions available</p>
      )}

      {selected && previewDiscount > 0 && (
        <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-emerald-900/20 border border-emerald-700/30 rounded-xl">
          <Tag size={13} className="text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300 flex-1">
            Estimated discount: {formatCurrency(previewDiscount)}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-charcoal-300 hover:text-red-400 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
