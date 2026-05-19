import { Request, Response } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export async function getPermissions(_req: Request, res: Response): Promise<void> {
  const result = await db.query(
    `SELECT role, module, can_read, can_write FROM role_permissions ORDER BY role, module`
  );
  const out: Record<string, Record<string, { can_read: boolean; can_write: boolean }>> = {};
  for (const row of result.rows) {
    if (!out[row.role]) out[row.role] = {};
    out[row.role][row.module] = { can_read: row.can_read, can_write: row.can_write };
  }
  res.json(out);
}

export async function updatePermissions(req: AuthRequest, res: Response): Promise<void> {
  const updates: { role: string; module: string; can_read: boolean; can_write: boolean }[] = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'Expected array of permission updates' });
    return;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const { role, module, can_read, can_write } of updates) {
      await client.query(
        `INSERT INTO role_permissions (role, module, can_read, can_write, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (role, module) DO UPDATE SET
           can_read  = EXCLUDED.can_read,
           can_write = EXCLUDED.can_write,
           updated_at = NOW()`,
        [role, module, can_read, can_write]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Permissions updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
