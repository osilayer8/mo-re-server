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
}

// List users (basic info)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();
    const users = await db.all(`SELECT id, email, firstName, lastName, role, active, createdAt, updatedAt FROM users ORDER BY id DESC`);
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
    if (role && typeof role !== 'string') return res.status(400).json({ error: 'Invalid role' });
    if (active !== undefined && !(active === 0 || active === 1 || active === '0' || active === '1')) return res.status(400).json({ error: 'Invalid active value' });

    // Prevent admin demoting themselves
    if (parseInt(id, 10) === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot remove your own admin role' });
    }

    const updates = [];
    const params = [];
    if (role) { updates.push('role = ?'); params.push(role); }
    if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    await db.run(`UPDATE users SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, params);

    const updated = await db.get('SELECT id, email, firstName, lastName, role, active FROM users WHERE id = ?', id);
    res.json({ user: updated });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
