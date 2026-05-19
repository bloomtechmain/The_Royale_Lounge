import { Router } from 'express';
import { getPermissions, updatePermissions } from '../controllers/permissionsController';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/roles';

const router = Router();
router.use(authenticate);
router.get('/', getPermissions);
router.put('/', requireAdmin, updatePermissions);

export default router;
