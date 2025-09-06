import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// List users (basic info)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const users = (
      await db.query(
        `SELECT id, email, first_name, last_name, role, active, created_at, updated_at
   FROM users
   ORDER BY id DESC`
      )
    ).rows;
    res.json({ users });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user (role / active) - admin only
router.put('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, active } = req.body;
    const db = getDatabase();

    // Basic validation
    if (role && typeof role !== 'string')
      return res.status(400).json({ error: 'Invalid role' });
    if (
      active !== undefined &&
      !(active === 0 || active === 1 || active === '0' || active === '1')
    )
      return res.status(400).json({ error: 'Invalid active value' });

    // Prevent admin demoting themselves
    if (parseInt(id, 10) === req.user.id && role && role !== 'admin') {
      return res
        .status(400)
        .json({ error: 'Cannot remove your own admin role' });
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;
    if (role) {
      paramIndex += 1; // increment because $1 will be used for id
      updates.push(`role = $${paramIndex}`);
      params.push(role);
    }
    if (active !== undefined) {
      paramIndex += 1;
      updates.push(`active = $${paramIndex}`);
      params.push(active ? 1 : 0);
    }

    if (updates.length === 0)
      return res.status(400).json({ error: 'No fields to update' });
    params.unshift(id);
    await db.query(
      `UPDATE users
   SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
   WHERE id = $1`,
      params
    );

    const updated = (
      await db.query(
        'SELECT id, email, first_name, last_name, role, active FROM users WHERE id = $1',
        [id]
      )
    ).rows[0];
    res.json({ user: updated });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
