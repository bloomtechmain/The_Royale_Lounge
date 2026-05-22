import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { startScheduler } from './services/schedulerService';

import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import customerRoutes from './routes/customers';
import rentalRoutes from './routes/rentals';
import posRoutes from './routes/pos';
import inventoryRoutes from './routes/inventory';
import returnsRoutes from './routes/returns';
import reportsRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import usersRoutes from './routes/users';
import notificationsRoutes from './routes/notifications';
import permissionsRoutes from './routes/permissions';
import analyticsRoutes from './routes/analytics';
import hrRoutes from './routes/hr';
import promotionsRoutes from './routes/promotions';
import invoiceRoutes from './routes/invoices';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? [env.CLIENT_URL]
    : [env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:4173'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), env.UPLOAD_DIR)));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/invoices', invoiceRoutes);  // Public PDF download (no auth)

// ─── Serve React client in production ────────────────────────────────────────
if (env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  // ─── Error Handling ───────────────────────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);
}

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`🚀 Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  console.log(`📡 API: http://localhost:${env.PORT}/api`);

  if (env.NODE_ENV !== 'test') {
    startScheduler();
  }
});

export default app;
