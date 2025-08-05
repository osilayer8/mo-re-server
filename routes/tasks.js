import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router({ mergeParams: true });

// Apply authentication to all task routes
router.use(authenticateToken);

// Get tasks for a project (only if project belongs to user)
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    
    // First verify the project belongs to the authenticated user
    const project = await db.get(
      'SELECT id FROM projects WHERE id = ? AND customerId = ? AND userId = ?', 
      req.params.projectId, req.params.customerId, req.user.id
    );
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    
    const tasks = await db.all('SELECT * FROM tasks WHERE projectId = ? AND userId = ?', req.params.projectId, req.user.id);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create task (only if project belongs to user)
router.post('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { name, estimatedHours = 1 } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Task name is required' });
    }
    
    // First verify the project belongs to the authenticated user
    const project = await db.get(
      'SELECT id FROM projects WHERE id = ? AND customerId = ? AND userId = ?', 
      req.params.projectId, req.params.customerId, req.user.id
    );
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    
    const result = await db.run(
      'INSERT INTO tasks (projectId, name, estimatedHours, completed, userId) VALUES (?, ?, ?, 0, ?)',
      req.params.projectId, name, estimatedHours, req.user.id
    );
    
    res.json({ 
      id: result.lastID, 
      projectId: req.params.projectId, 
      name, 
      estimatedHours, 
      completed: 0,
      userId: req.user.id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task (only if owned by user)
router.put('/:taskId', async (req, res) => {
  try {
    const db = getDatabase();
    const { name, estimatedHours = 1, completed } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Task name is required' });
    }
    
    // Verify the task belongs to the user and the correct project
    const task = await db.get(
      `SELECT t.id FROM tasks t
       JOIN projects p ON t.projectId = p.id
       WHERE t.id = ? AND t.projectId = ? AND p.customerId = ? AND t.userId = ? AND p.userId = ?`, 
      req.params.taskId, req.params.projectId, req.params.customerId, req.user.id, req.user.id
    );
    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }
    
    await db.run(
      'UPDATE tasks SET name = ?, estimatedHours = ?, completed = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND projectId = ? AND userId = ?',
      name, estimatedHours, completed ? 1 : 0, req.params.taskId, req.params.projectId, req.user.id
    );
    
    const updated = await db.get('SELECT * FROM tasks WHERE id = ? AND projectId = ? AND userId = ?', req.params.taskId, req.params.projectId, req.user.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete task (only if owned by user)
router.delete('/:taskId', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Verify the task belongs to the user and the correct project
    const task = await db.get(
      `SELECT t.id FROM tasks t
       JOIN projects p ON t.projectId = p.id
       WHERE t.id = ? AND t.projectId = ? AND p.customerId = ? AND t.userId = ? AND p.userId = ?`, 
      req.params.taskId, req.params.projectId, req.params.customerId, req.user.id, req.user.id
    );
    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }
    
    await db.run('DELETE FROM tasks WHERE id = ? AND projectId = ? AND userId = ?', req.params.taskId, req.params.projectId, req.user.id);
    res.json({ id: req.params.taskId, projectId: req.params.projectId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
