import api from './api';
import type { Promotion } from '../types';

export const promotionService = {
  getAll: async (): Promise<Promotion[]> => {
    const { data } = await api.get('/promotions');
    return data;
  },
  getActive: async (scope: 'pos' | 'rental'): Promise<Promotion[]> => {
    const { data } = await api.get('/promotions/active', { params: { scope } });
    return data;
  },
  create: async (payload: any): Promise<Promotion> => {
    const { data } = await api.post('/promotions', payload);
    return data;
  },
  update: async (id: string, payload: any): Promise<Promotion> => {
    const { data } = await api.patch(`/promotions/${id}`, payload);
    return data;
  },
  toggle: async (id: string): Promise<Promotion> => {
    const { data } = await api.patch(`/promotions/${id}/toggle`);
    return data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/promotions/${id}`);
  },
};

// ─── Shared discount calculator ───────────────────────────────────────────────
// Used by PromotionSelector for preview; server recalculates authoritatively
export function calculatePromoDiscount(
  promo: Promotion,
  subtotal: number,
  items: { unitPrice: number; quantity: number }[],
  rentalDays = 1,
  scope: 'pos' | 'rental' = 'pos'
): number {
  if (!promo) return 0;
  switch (promo.type) {
    case 'percentage':
      return subtotal * ((promo.percentage_value ?? 0) / 100);
    case 'flat_amount':
      return Math.min(promo.flat_amount_value ?? 0, subtotal);
    case 'buy_x_get_y': {
      const totalQty = items.reduce((s, i) => s + i.quantity, 0);
      if (totalQty < (promo.buy_quantity ?? 0)) return 0;
      const cheapest = items.length > 0 ? Math.min(...items.map(i => i.unitPrice)) : 0;
      const freeQty = promo.get_quantity ?? 0;
      return freeQty * cheapest * (scope === 'rental' ? rentalDays : 1);
    }
    case 'free_item':
      return scope === 'rental'
        ? (promo.free_variant_rental_price_per_day ?? 0) * rentalDays
        : (promo.free_variant_selling_price ?? 0);
    default:
      return 0;
  }
}

export function getPromoDiscountLabel(promo: Promotion): string {
  switch (promo.type) {
    case 'percentage':
      return `${promo.percentage_value}% off`;
    case 'flat_amount':
      return `LKR ${promo.flat_amount_value} off`;
    case 'buy_x_get_y':
      return `Buy ${promo.buy_quantity} Get ${promo.get_quantity} Free`;
    case 'free_item':
      return `Free: ${promo.free_product_name ?? ''} ${promo.free_variant_size ?? ''}`.trim();
    default:
      return '';
  }
}
