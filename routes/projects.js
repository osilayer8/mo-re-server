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
      // Also fetch tasks for each project (only user's tasks)
      for (const project of projects) {
        const tasks = await db.all('SELECT * FROM tasks WHERE projectId = ? AND userId = ?', project.id, req.user.id);
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
    const { description = '', hourlyRate = 0 } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    // First verify the customer belongs to the authenticated user
    const customer = await db.get('SELECT id FROM customers WHERE id = ? AND userId = ?', req.params.customerId, req.user.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or access denied' });
    }
    
    const result = await db.run(
      'INSERT INTO projects (customerId, name, description, hourlyRate, userId) VALUES (?, ?, ?, ?, ?)',
      req.params.customerId, name, description, hourlyRate, req.user.id
    );
    
    res.json({ 
      id: result.lastID, 
      customerId: req.params.customerId, 
      name, 
      description, 
      hourlyRate,
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
    const { description = '', hourlyRate = 0 } = req.body;
    
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
      'UPDATE projects SET name = ?, description = ?, hourlyRate = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND customerId = ? AND userId = ?',
      name, description, hourlyRate, req.params.projectId, req.params.customerId, req.user.id
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
