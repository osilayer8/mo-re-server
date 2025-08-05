import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all customer routes
router.use(authenticateToken);

// Get all customers for the authenticated user
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { includeProjects } = req.query;
    const customers = await db.all('SELECT * FROM customers WHERE userId = ?', req.user.id);
    
    if (includeProjects === 'true') {
      // Also fetch projects for each customer (only user's projects)
      for (const customer of customers) {
        const projects = await db.all('SELECT * FROM projects WHERE customerId = ? AND userId = ?', customer.id, req.user.id);
        customer.projects = projects;
      }
    }
    
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create customer for the authenticated user
router.post('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    
    const result = await db.run('INSERT INTO customers (name, userId) VALUES (?, ?)', name, req.user.id);
    res.json({ id: result.lastID, name, userId: req.user.id });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update customer (only if owned by authenticated user)
router.put('/:customerId', async (req, res) => {
  try {
    const db = getDatabase();
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    
    // Check if customer belongs to the user
    const customer = await db.get('SELECT id FROM customers WHERE id = ? AND userId = ?', req.params.customerId, req.user.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or access denied' });
    }
    
    await db.run('UPDATE customers SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?', name, req.params.customerId, req.user.id);
    res.json({ id: req.params.customerId, name, userId: req.user.id });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete customer (only if owned by authenticated user)
router.delete('/:customerId', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Check if customer belongs to the user
    const customer = await db.get('SELECT id FROM customers WHERE id = ? AND userId = ?', req.params.customerId, req.user.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or access denied' });
    }
    
    // Delete customer and cascade delete projects and tasks
    await db.run('DELETE FROM tasks WHERE projectId IN (SELECT id FROM projects WHERE customerId = ? AND userId = ?)', req.params.customerId, req.user.id);
    await db.run('DELETE FROM projects WHERE customerId = ? AND userId = ?', req.params.customerId, req.user.id);
    await db.run('DELETE FROM customers WHERE id = ? AND userId = ?', req.params.customerId, req.user.id);
    
    res.json({ id: req.params.customerId });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
