import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../config/database';

export async function getUsers(_req: Request, res: Response): Promise<void> {
  const result = await db.query(`
    SELECT id, name, email, role, is_active, phone, avatar_url, created_at
    FROM users ORDER BY name
  `);
  res.json(result.rows);
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const { name, email, password, role, phone } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: 'Name, email, password, and role are required' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await db.query(`
    INSERT INTO users (name, email, password_hash, role, phone)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, name, email, role, phone, is_active, created_at
  `, [name, email.toLowerCase(), passwordHash, role, phone || null]);

  res.status(201).json(result.rows[0]);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { name, email, role, phone, isActive, password } = req.body;

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const result = await db.query(`
    UPDATE users SET
      name = COALESCE($1, name),
      email = COALESCE($2, email),
      role = COALESCE($3, role),
      phone = COALESCE($4, phone),
      is_active = COALESCE($5, is_active),
      password_hash = COALESCE($6, password_hash),
      updated_at = NOW()
    WHERE id = $7
    RETURNING id, name, email, role, phone, is_active, updated_at
  `, [name, email, role, phone, isActive, passwordHash, id]);

  if (!result.rows[0]) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(result.rows[0]);
}

export async function resetUserPassword(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, id]
  );

  res.json({ message: 'Password reset successfully' });
}

export async function deactivateUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await db.query(`UPDATE users SET is_active = false WHERE id = $1`, [id]);
  res.json({ message: 'User deactivated' });
}
