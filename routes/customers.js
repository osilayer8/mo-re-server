import express from 'express';
import { getDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { toCamelCase } from '../utils/camel-case.js';

const router = express.Router();

// Apply authentication to all customer routes
router.use(authenticateToken);

// Get all customers for the authenticated user
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const { includeProjects } = req.query;
    const customers = (
      await db.query('SELECT * FROM customers WHERE user_id = $1', [
        req.user.id
      ])
    ).rows;

    if (includeProjects === 'true') {
      // Also fetch projects for each customer (only user's projects)
      for (const customer of customers) {
        const projects = (
          await db.query(
            'SELECT * FROM projects WHERE customer_id = $1 AND user_id = $2',
            [customer.id, req.user.id]
          )
        ).rows;
        customer.projects = projects;
      }
    }

    const camelCaseCustomers = toCamelCase(customers);
    res.json(camelCaseCustomers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create customer for the authenticated user
router.post('/', async (req, res) => {
  try {
    const db = getDatabase();
    const {
      name,
      contactPerson = '',
      billingStreet = '',
      billingNumber = '',
      billingPostalCode = '',
      billingCity = '',
      billingState = '',
      billingCountry = '',
      email = '',
      phone = '',
      vatNumber = ''
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const result = await db.query(
      `INSERT INTO customers (
    name, contact_person, billing_street, billing_number, billing_postal_code,
    billing_city, billing_state, billing_country, email, phone, vat_number, user_id
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  RETURNING id`,
      [
        name,
        contactPerson,
        billingStreet,
        billingNumber,
        billingPostalCode,
        billingCity,
        billingState,
        billingCountry,
        email,
        phone,
        vatNumber,
        req.user.id
      ]
    );

    res.json({
      id: result.rows[0].id,
      name,
      contactPerson,
      billingStreet,
      billingNumber,
      billingPostalCode,
      billingCity,
      billingState,
      billingCountry,
      email,
      phone,
      vatNumber,
      userId: req.user.id
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update customer (only if owned by authenticated user)
router.put('/:customerId', async (req, res) => {
  try {
    const db = getDatabase();
    const {
      name,
      contactPerson = '',
      billingStreet = '',
      billingNumber = '',
      billingPostalCode = '',
      billingCity = '',
      billingState = '',
      billingCountry = '',
      email = '',
      phone = '',
      vatNumber = ''
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Check if customer belongs to the user
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

    await db.query(
      `UPDATE customers
   SET name = $1, contact_person = $2, billing_street = $3, billing_number = $4,
       billing_postal_code = $5, billing_city = $6, billing_state = $7,
       billing_country = $8, email = $9, phone = $10, vat_number = $11,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $12 AND user_id = $13`,
      [
        name,
        contactPerson,
        billingStreet,
        billingNumber,
        billingPostalCode,
        billingCity,
        billingState,
        billingCountry,
        email,
        phone,
        vatNumber,
        req.params.customerId,
        req.user.id
      ]
    );

    res.json({
      id: req.params.customerId,
      name,
      contactPerson,
      billingStreet,
      billingNumber,
      billingPostalCode,
      billingCity,
      billingState,
      billingCountry,
      email,
      phone,
      vatNumber,
      userId: req.user.id
    });
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

    // Delete customer and cascade delete projects and tasks
    await db.query(
      'DELETE FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE customer_id = $1 AND user_id = $2)',
      [req.params.customerId, req.user.id]
    );

    await db.query(
      'DELETE FROM projects WHERE customer_id = $1 AND user_id = $2',
      [req.params.customerId, req.user.id]
    );

    await db.query('DELETE FROM customers WHERE id = $1 AND user_id = $2', [
      req.params.customerId,
      req.user.id
    ]);

    res.json({ id: req.params.customerId });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
