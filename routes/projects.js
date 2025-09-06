import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { toCamelCase } from '../utils/camel-case.js';

const router = express.Router({ mergeParams: true });

// Apply authentication to all project routes
router.use(authenticateToken);

// Get projects for a customer (only if customer belongs to user)
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { includeTasks } = req.query;

    // First verify the customer belongs to the authenticated user
    const customer = await db.query(
      'SELECT id FROM customers WHERE id = $1 AND user_id = $2',
      [req.params.customerId, req.user.id]
    );
    if (!customer) {
      return res
        .status(404)
        .json({ error: 'Customer not found or access denied' });
    }

    const projects = await db.query(
      'SELECT * FROM projects WHERE customer_id = $1 AND user_id = $2',
      [req.params.customerId, req.user.id]
    );

    if (includeTasks === 'true') {
      // Also fetch tasks for each project (only user's tasks) ordered by "order"
      for (const project of projects.rows) {
        const tasks = await db.query(
          'SELECT * FROM tasks WHERE project_id = $1 AND user_id = $2 ORDER BY order_num ASC',
          [project.id, req.user.id]
        );
        project.tasks = tasks.rows;
      }
    }

    res.json(projects.rows.map(toCamelCase));
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
    const {
      description = '',
      hourlyRate = 0,
      pricingType = 'HOURLY',
      fixedPrice = 0,
      invoiceDate = ''
    } = req.body;
    let { invoiceNumber = '' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const formattedInvoiceDate =
      invoiceDate && invoiceDate.trim() !== '' ? invoiceDate : null;

    // First verify the customer belongs to the authenticated user
    const customer = (
      await db.query(
        'SELECT id FROM customers WHERE id = $1 AND user_id = $2',
        [req.params.customerId, req.user.id]
      )
    ).rows[0];

    if (!customer) {
      return res
        .status(404)
        .json({ error: 'Customer not found or access denied' });
    }

    // If invoiceNumber not provided, default to user's current
    if (!invoiceNumber) {
      const userRow = (
        await db.query('SELECT invoice_number FROM users WHERE id = $1', [
          req.user.id
        ])
      ).rows[0];

      invoiceNumber = userRow?.invoice_number || '';
    }
    const result = await db.query(
      `INSERT INTO projects (
    customer_id, name, description, invoice_number,
    invoice_date, hourly_rate, pricing_type, fixed_price, user_id
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  RETURNING id`,
      [
        req.params.customerId,
        name,
        description,
        invoiceNumber,
        formattedInvoiceDate,
        hourlyRate,
        pricingType,
        fixedPrice,
        req.user.id
      ]
    );

    // After creating a project, auto-increment the user's global invoice number
    const incrementPattern = (current) => {
      if (!current || current.trim() === '') return '00001';
      const match = current.match(/^(.*?)(\d+)([^\d]*)$/);
      if (!match) return current + '-001';
      const [, prefix, num, suffix] = match;
      const width = num.length;
      const nextNum = String(parseInt(num, 10) + 1).padStart(width, '0');
      return prefix + nextNum + suffix;
    };
    const nextInvoiceNo = incrementPattern(
      (
        await db.query('SELECT invoice_number FROM users WHERE id = $1', [
          req.user.id
        ])
      ).rows[0]?.invoice_number || ''
    );
    await db.query(
      'UPDATE users SET invoice_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [nextInvoiceNo, req.user.id]
    );

    res.json({
      id: result.rows[0].id,
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
    const {
      description = '',
      hourlyRate = 0,
      pricingType = 'HOURLY',
      fixedPrice = 0,
      invoiceNumber = '',
      invoiceDate = ''
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const formattedInvoiceDate =
      invoiceDate && invoiceDate.trim() !== '' ? invoiceDate : null;

    // Verify the project belongs to the user and the correct customer
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

    await db.query(
      `UPDATE projects
   SET name = $1,
       description = $2,
       invoice_number = $3,
       invoice_date = $4,
       hourly_rate = $5,
       pricing_type = $6,
       fixed_price = $7,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $8 AND customer_id = $9 AND user_id = $10`,
      [
        name,
        description,
        invoiceNumber,
        formattedInvoiceDate,
        hourlyRate,
        pricingType,
        fixedPrice,
        req.params.projectId,
        req.params.customerId,
        req.user.id
      ]
    );

    // Return updated project
    const updated = (
      await db.query(
        'SELECT * FROM projects WHERE id = $1 AND customer_id = $2 AND user_id = $3',
        [req.params.projectId, req.params.customerId, req.user.id]
      )
    ).rows[0];

    res.json(toCamelCase(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete project (only if owned by user)
router.delete('/:projectId', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify the project belongs to the user and the correct customer
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

    // Delete project and cascade delete tasks
    await db.query('DELETE FROM tasks WHERE project_id = $1 AND user_id = $2', [
      req.params.projectId,
      req.user.id
    ]);

    await db.query(
      'DELETE FROM projects WHERE id = $1 AND customer_id = $2 AND user_id = $3',
      [req.params.projectId, req.params.customerId, req.user.id]
    );

    res.json({ id: req.params.projectId, customerId: req.params.customerId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
