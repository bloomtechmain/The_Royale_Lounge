import { Router, Response, NextFunction } from 'express';
import {
  listPromotions,
  getActivePromotions,
  createPromotion,
  updatePromotion,
  togglePromotion,
  deletePromotion,
} from '../controllers/promotionsController';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Inline admin/manager guard
function requireManagerOrAbove(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    res.status(403).json({ error: 'Forbidden: manager or admin required' });
    return;
  }
  next();
}

router.get('/',             listPromotions);
router.get('/active',       getActivePromotions);
router.post('/',            requireManagerOrAbove, createPromotion);
router.patch('/:id',        requireManagerOrAbove, updatePromotion);
router.patch('/:id/toggle', requireManagerOrAbove, togglePromotion);
router.delete('/:id',       requireManagerOrAbove, deletePromotion);

export default router;
