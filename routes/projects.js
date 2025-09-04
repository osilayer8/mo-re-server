import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router({ mergeParams: true });

// Apply authentication to all project routes
router.use(authenticateToken);

// Get projects for a customer (only if customer belongs to user)
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { includeTasks } = req.query;
    
    // First verify the customer belongs to the authenticated user
    const customer = await db.get('SELECT id FROM customers WHERE id = ? AND userId = ?', req.params.customerId, req.user.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or access denied' });
    }
    
    const projects = await db.all('SELECT * FROM projects WHERE customerId = ? AND userId = ?', req.params.customerId, req.user.id);
    
    if (includeTasks === 'true') {
      // Also fetch tasks for each project (only user's tasks) ordered by "order"
      for (const project of projects) {
        const tasks = await db.all('SELECT * FROM tasks WHERE projectId = ? AND userId = ? ORDER BY "order" ASC', project.id, req.user.id);
        project.tasks = tasks;
      }
    }
    
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create project (only if customer belongs to user)
router.post('/', async (req, res) => {
  try {
    const db = getDatabase();
  const { name } = req.body;
  const { description = '', hourlyRate = 0, pricingType = 'HOURLY', fixedPrice = 0, invoiceDate = '' } = req.body;
  let { invoiceNumber = '' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    // First verify the customer belongs to the authenticated user
    const customer = await db.get('SELECT id FROM customers WHERE id = ? AND userId = ?', req.params.customerId, req.user.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or access denied' });
    }
    
    // If invoiceNumber not provided, default to user's current
    if (!invoiceNumber) {
      const userRow = await db.get('SELECT invoiceNumber FROM users WHERE id = ?', req.user.id)
      invoiceNumber = userRow?.invoiceNumber || ''
    }
    const result = await db.run(
      'INSERT INTO projects (customerId, name, description, invoiceNumber, invoiceDate, hourlyRate, pricingType, fixedPrice, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      req.params.customerId, name, description, invoiceNumber, invoiceDate, hourlyRate, pricingType, fixedPrice, req.user.id
    );

    // After creating a project, auto-increment the user's global invoice number
    const incrementPattern = (current) => {
      if (!current || current.trim() === '') return '00001'
      const match = current.match(/^(.*?)(\d+)([^\d]*)$/)
      if (!match) return current + '-001'
      const [, prefix, num, suffix] = match
      const width = num.length
      const nextNum = String(parseInt(num, 10) + 1).padStart(width, '0')
      return prefix + nextNum + suffix
    }
    const nextInvoiceNo = incrementPattern((await db.get('SELECT invoiceNumber FROM users WHERE id = ?', req.user.id))?.invoiceNumber || '')
    await db.run('UPDATE users SET invoiceNumber = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', nextInvoiceNo, req.user.id)
    
    res.json({ 
      id: result.lastID, 
      customerId: req.params.customerId, 
      name, 
  description, 
  invoiceNumber,
  hourlyRate,
  invoiceDate,
      pricingType,
      fixedPrice,
      userId: req.user.id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update project (only if owned by user)
router.put('/:projectId', async (req, res) => {
  try {
    const db = getDatabase();
  const { name } = req.body;
  const { description = '', hourlyRate = 0, pricingType = 'HOURLY', fixedPrice = 0, invoiceNumber = '', invoiceDate = '' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    // Verify the project belongs to the user and the correct customer
    const project = await db.get(
      'SELECT id FROM projects WHERE id = ? AND customerId = ? AND userId = ?', 
      req.params.projectId, req.params.customerId, req.user.id
    );
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    
    await db.run(
      'UPDATE projects SET name = ?, description = ?, invoiceNumber = ?, invoiceDate = ?, hourlyRate = ?, pricingType = ?, fixedPrice = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND customerId = ? AND userId = ?',
      name, description, invoiceNumber, invoiceDate, hourlyRate, pricingType, fixedPrice, req.params.projectId, req.params.customerId, req.user.id
    );
    
    // Return updated project
    const updated = await db.get('SELECT * FROM projects WHERE id = ? AND customerId = ? AND userId = ?', req.params.projectId, req.params.customerId, req.user.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete project (only if owned by user)
router.delete('/:projectId', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Verify the project belongs to the user and the correct customer
    const project = await db.get(
      'SELECT id FROM projects WHERE id = ? AND customerId = ? AND userId = ?', 
      req.params.projectId, req.params.customerId, req.user.id
    );
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    
    // Delete project and cascade delete tasks
    await db.run('DELETE FROM tasks WHERE projectId = ? AND userId = ?', req.params.projectId, req.user.id);
    await db.run('DELETE FROM projects WHERE id = ? AND customerId = ? AND userId = ?', req.params.projectId, req.params.customerId, req.user.id);
    
    res.json({ id: req.params.projectId, customerId: req.params.customerId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
