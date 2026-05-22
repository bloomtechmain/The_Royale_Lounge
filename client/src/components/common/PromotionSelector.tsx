import { Tag, X, Percent, Minus, ShoppingBag, Gift } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  promotionService,
  calculatePromoDiscount,
  getPromoDiscountLabel,
} from '@/services/promotionService';
import type { Promotion, PromotionType } from '@/types';
import { cn } from '@/utils/cn';

interface PromotionSelectorProps {
  scope: 'pos' | 'rental';
  cartSubtotal: number;
  cartItems: { unitPrice: number; quantity: number }[];
  rentalDays?: number;
  selectedId: string | null;
  onSelect: (promo: Promotion | null) => void;
}

const TYPE_ICON: Record<PromotionType, React.ElementType> = {
  percentage:  Percent,
  flat_amount: Minus,
  buy_x_get_y: ShoppingBag,
  free_item:   Gift,
};

const TYPE_COLOR: Record<PromotionType, string> = {
  percentage:  'border-gold-600   bg-gold-700/10   text-gold-400',
  flat_amount: 'border-blue-500   bg-blue-500/10   text-blue-400',
  buy_x_get_y: 'border-purple-500 bg-purple-500/10 text-purple-400',
  free_item:   'border-emerald-500 bg-emerald-500/10 text-emerald-400',
};

const TYPE_IDLE = 'border-charcoal-500 bg-charcoal-600/30 text-charcoal-200 hover:border-charcoal-400 hover:text-charcoal-50';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(n);

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

  const eligible = promos.filter(
    (p) => !p.min_order_amount || cartSubtotal >= p.min_order_amount
  );

  const selected = eligible.find((p) => p.id === selectedId) ?? null;

  const previewDiscount = selected
    ? calculatePromoDiscount(selected, cartSubtotal, cartItems, rentalDays, scope)
    : 0;

  if (isLoading) return null;
  if (eligible.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-charcoal-100">
        Promotion <span className="text-charcoal-300 font-normal">(optional)</span>
      </p>

      <div className="grid grid-cols-2 gap-2">
        {eligible.map((p) => {
          const Icon = TYPE_ICON[p.type] ?? Tag;
          const isSelected = p.id === selectedId;
          const discount = calculatePromoDiscount(p, cartSubtotal, cartItems, rentalDays, scope);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : p)}
              className={cn(
                'flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border-2 text-left transition-all',
                isSelected ? TYPE_COLOR[p.type] : TYPE_IDLE
              )}
            >
              <div className="flex items-center gap-1.5 w-full">
                <Icon size={13} className="flex-shrink-0" />
                <span className="text-xs font-semibold truncate flex-1">{p.name}</span>
                {isSelected && (
                  <X size={11} className="flex-shrink-0 opacity-70" />
                )}
              </div>
              <span className="text-[11px] opacity-75 leading-tight">{getPromoDiscountLabel(p)}</span>
              {discount > 0 && (
                <span className="text-[10px] font-medium text-emerald-400">
                  -{formatCurrency(discount)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && previewDiscount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-900/20 border border-emerald-700/30 rounded-xl">
          <Tag size={13} className="text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300 flex-1">
            Discount: {formatCurrency(previewDiscount)}
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
