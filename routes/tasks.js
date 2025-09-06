import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { toCamelCase } from '../utils/camel-case.js';

const router = express.Router({ mergeParams: true });

// Apply authentication to all task routes
router.use(authenticateToken);

// Get tasks for a project (only if project belongs to user)
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();

    // First verify the project belongs to the authenticated user
    const project = (
      await db.query(
        'SELECT id FROM projects WHERE id = $1 AND customer_id = $2 AND user_id = $3',
        [req.params.projectId, req.params.customerId, req.user.id]
      )
    ).rows[0];

    if (!project) {
      return res
        .status(404)
        .json({ error: 'Project not found or access denied' });
    }

    const tasks = (
      await db.query(
        'SELECT * FROM tasks WHERE project_id = $1 AND user_id = $2',
        [req.params.projectId, req.user.id]
      )
    ).rows;

    res.json(tasks.map(toCamelCase));
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create task (only if project belongs to user)
router.post('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { name, estimatedHours = 1, date = null } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Task name is required' });
    }

    // First verify the project belongs to the authenticated user
    const project = (
      await db.query(
        'SELECT id FROM projects WHERE id = $1 AND customer_id = $2 AND user_id = $3',
        [req.params.projectId, req.params.customerId, req.user.id]
      )
    ).rows[0];
    if (!project) {
      return res
        .status(404)
        .json({ error: 'Project not found or access denied' });
    }

    const result = await db.query(
      `INSERT INTO tasks (
    project_id, name, estimated_hours, completed, user_id, date
  ) VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING id`,
      [
        req.params.projectId,
        name,
        estimatedHours,
        0, // completed = false
        req.user.id,
        date
      ]
    );

    res.json({
      id: result.rows[0].id,
      projectId: req.params.projectId,
      name,
      estimatedHours,
      completed: 0,
      userId: req.user.id,
      date
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task (only if owned by user)
router.put('/:taskId', async (req, res) => {
  try {
    const db = getDatabase();
    const { name, estimatedHours = 1, completed, date = null } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Task name is required' });
    }

    // Verify the task belongs to the user and the correct project
    const task = (
      await db.query(
        `SELECT t.id
   FROM tasks t
   JOIN projects p ON t.project_id = p.id
   WHERE t.id = $1
     AND t.project_id = $2
     AND p.customer_id = $3
     AND t.user_id = $4
     AND p.user_id = $5`,
        [
          req.params.taskId,
          req.params.projectId,
          req.params.customerId,
          req.user.id,
          req.user.id
        ]
      )
    ).rows[0];

    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    await db.query(
      `UPDATE tasks
   SET name = $1,
       estimated_hours = $2,
       completed = $3,
       date = $4,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $5 AND project_id = $6 AND user_id = $7`,
      [
        name,
        estimatedHours,
        completed ? 1 : 0,
        date,
        req.params.taskId,
        req.params.projectId,
        req.user.id
      ]
    );

    const updated = (
      await db.query(
        'SELECT * FROM tasks WHERE id = $1 AND project_id = $2 AND user_id = $3',
        [req.params.taskId, req.params.projectId, req.user.id]
      )
    ).rows[0];

    res.json(toCamelCase(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete task (only if owned by user)
router.delete('/:taskId', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify the task belongs to the user and the correct project
    const task = (
      await db.query(
        `SELECT t.id
   FROM tasks t
   JOIN projects p ON t.project_id = p.id
   WHERE t.id = $1
     AND t.project_id = $2
     AND p.customer_id = $3
     AND t.user_id = $4
     AND p.user_id = $5`,
        [
          req.params.taskId,
          req.params.projectId,
          req.params.customerId,
          req.user.id,
          req.user.id
        ]
      )
    ).rows[0];

    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    await db.query(
      'DELETE FROM tasks WHERE id = $1 AND project_id = $2 AND user_id = $3',
      [req.params.taskId, req.params.projectId, req.user.id]
    );

    res.json({ id: req.params.taskId, projectId: req.params.projectId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order of tasks
router.patch('/order', async (req, res) => {
  try {
    const db = getDatabase();
    const { order } = req.body; // [{ id: taskId, order: newOrder }, ...]
    if (!Array.isArray(order)) {
      return res
        .status(400)
        .json({ error: 'Order must be an array of task objects.' });
    }

    // Verify project ownership
    const project = (
      await db.query(
        'SELECT id FROM projects WHERE id = $1 AND customer_id = $2 AND user_id = $3',
        [req.params.projectId, req.params.customerId, req.user.id]
      )
    ).rows[0];
    if (!project) {
      return res
        .status(404)
        .json({ error: 'Project not found or access denied' });
    }

    // Update each task's order
    for (const item of order) {
      await db.query(
        'UPDATE tasks SET order_num = $1 WHERE id = $2 AND project_id = $3 AND user_id = $4',
        [item.order, item.id, req.params.projectId, req.user.id]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating task order:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
