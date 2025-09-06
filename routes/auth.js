import express from 'express';
import { getDatabase } from '../config/database.js';
import {
  encryptValue,
  decryptValue,
  maskIban,
  isEncryptionAvailable
} from '../utils/encryption.js';
import {
  generateToken,
  hashPassword,
  comparePassword,
  isValidEmail,
  isValidPassword
} from '../utils/auth.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      locale = 'en',
      companyName = '',
      companyVatId = '',
      companyStreet = '',
      companyNumber = '',
      companyPostalCode = '',
      companyCity = '',
      companyState = '',
      companyCountry = '',
      companyPhone = ''
    } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!isValidPassword(password)) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters long' });
    }

    const db = getDatabase();

    // Check if user already exists
    const existingUser = (
      await db.query('SELECT id FROM users WHERE email = $1', [
        email.toLowerCase()
      ])
    ).rows[0];
    if (existingUser) {
      return res
        .status(400)
        .json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user (inactive by default) — include company/profile fields
    const result = await db.query(
      `INSERT INTO users (
    email, password, first_name, last_name,
    company_name, company_vat_id, company_street, company_number, company_postal_code,
    company_city, company_state, company_country, company_phone,
    locale, role, active
  ) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14,
    $15, $16
  )
  RETURNING id`,
      [
        email.toLowerCase(),
        hashedPassword,
        firstName,
        lastName,
        companyName,
        companyVatId,
        companyStreet,
        companyNumber,
        companyPostalCode,
        companyCity,
        companyState,
        companyCountry,
        companyPhone,
        locale,
        'user',
        0
      ]
    );

    // Do not auto-login newly created users; return 201 and user id so operator can activate
    res.status(201).json({
      message: 'User created successfully (awaiting activation)',
      user: {
        id: result.rows[0].id,
        email: email.toLowerCase(),
        firstName,
        lastName,
        companyName,
        companyVatId,
        companyStreet,
        companyNumber,
        companyPostalCode,
        companyCity,
        companyState,
        companyCountry,
        companyPhone,
        locale,
        role: 'user',
        active: 0
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDatabase();

    // Find user
    const user = (
      await db.query('SELECT * FROM users WHERE email = $1', [
        email.toLowerCase()
      ])
    ).rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Ensure account is active
    if (!user.active) {
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Generate token
    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role || 'user',
        active: user.active
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const row = (
      await db.query(
        `SELECT id, email, first_name, last_name,
          company_name, company_street, company_number, company_postal_code, company_city,
          company_state, company_country, company_phone, company_vat_id, vat_percent,
          invoice_number, bank_iban_cipher, bank_iban_iv, bank_iban_tag, bank_name, bank_bic,
          invoice_notes, locale, role, active
   FROM users
   WHERE id = $1`,
        [req.user.id]
      )
    ).rows[0];
    if (!row) return res.status(404).json({ error: 'User not found' });
    let decryptedIban = '';
    if (row.bank_iban_cipher) {
      decryptedIban = decryptValue({
        cipher: row.bank_iban_cipher,
        iv: row.bank_iban_iv,
        tag: row.bank_iban_tag
      });
    }
    const user = {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      companyName: row.company_name,
      companyStreet: row.company_street,
      companyNumber: row.company_number,
      companyPostalCode: row.company_postal_code,
      companyCity: row.company_city,
      companyState: row.company_state,
      companyCountry: row.company_country,
      companyPhone: row.company_phone,
      companyVatId: row.company_vat_id,
      vatPercent: row.vat_percent ?? 0,
      invoiceNumber: row.invoice_number,
      bankName: row.bank_name,
      bankBic: row.bank_bic,
      invoiceNotes: row.invoice_notes,
      bankIbanMasked: maskIban(decryptedIban),
      bankIban: decryptedIban, // full value for settings page
      locale: row.locale || 'en',
      role: row.role || 'user',
      active: row.active ? 1 : 0
    };
    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      companyName = '',
      companyStreet = '',
      companyNumber = '',
      companyPostalCode = '',
      companyCity = '',
      companyState = '',
      companyCountry = '',
      companyPhone = '',
      companyVatId = '',
      vatPercent = 0,
      invoiceNumber = '',
      bankIban = '',
      bankName = '',
      bankBic = '',
      invoiceNotes = '',
      locale = 'en'
    } = req.body;

    if (!firstName || !lastName) {
      return res
        .status(400)
        .json({ error: 'First name and last name are required' });
    }

    const db = getDatabase();

    let cipherFields = { bankIbanCipher: '', bankIbanIv: '', bankIbanTag: '' };
    if (bankIban) {
      if (isEncryptionAvailable()) {
        const normalized = bankIban.replace(/\s+/g, '').toUpperCase();
        const { cipher, iv, tag } = encryptValue(normalized);
        cipherFields = {
          bankIbanCipher: cipher,
          bankIbanIv: iv,
          bankIbanTag: tag
        };
      } else {
        // Store plaintext in cipher column (still better than failing) – will be re-encrypted later when key present
        cipherFields = {
          bankIbanCipher: bankIban,
          bankIbanIv: '',
          bankIbanTag: ''
        };
      }
    }

    await db.query(
      `UPDATE users
   SET first_name = $1, last_name = $2, company_name = $3, company_street = $4,
       company_number = $5, company_postal_code = $6, company_city = $7, company_state = $8,
       company_country = $9, company_phone = $10, company_vat_id = $11, vat_percent = $12,
       invoice_number = $13, bank_iban_cipher = $14, bank_iban_iv = $15, bank_iban_tag = $16,
       bank_name = $17, bank_bic = $18, invoice_notes = $19, locale = $20,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $21`,
      [
        firstName,
        lastName,
        companyName,
        companyStreet,
        companyNumber,
        companyPostalCode,
        companyCity,
        companyState,
        companyCountry,
        companyPhone,
        companyVatId,
        vatPercent,
        invoiceNumber,
        cipherFields.bankIbanCipher,
        cipherFields.bankIbanIv,
        cipherFields.bankIbanTag,
        bankName,
        bankBic,
        invoiceNotes,
        locale,
        req.user.id
      ]
    );

    const updated = (
      await db.query(
        `SELECT id, email, first_name, last_name,
          company_name, company_street, company_number, company_postal_code, company_city,
          company_state, company_country, company_phone, company_vat_id, vat_percent,
          invoice_number, bank_iban_cipher, bank_iban_iv, bank_iban_tag, bank_name, bank_bic,
          invoice_notes, locale, role, active
   FROM users
   WHERE id = $1`,
        [req.user.id]
      )
    ).rows[0];
    let decryptedIban = '';
    if (updated.bank_iban_cipher) {
      decryptedIban = decryptValue({
        cipher: updated.bank_iban_cipher,
        iv: updated.bank_iban_iv,
        tag: updated.bank_iban_tag
      });
    }
    const updatedUser = {
      id: updated.id,
      email: updated.email,
      firstName: updated.first_name,
      lastName: updated.last_name,
      companyName: updated.company_name,
      companyStreet: updated.company_street,
      companyNumber: updated.company_number,
      companyPostalCode: updated.company_postal_code,
      companyCity: updated.company_city,
      companyState: updated.company_state,
      companyCountry: updated.company_country,
      companyPhone: updated.company_phone,
      companyVatId: updated.company_vat_id,
      vatPercent: updated.vat_percent ?? 0,
      invoiceNumber: updated.invoice_number,
      bankName: updated.bank_name,
      bankBic: updated.bank_bic,
      invoiceNotes: updated.invoice_notes,
      bankIbanMasked: maskIban(decryptedIban),
      bankIban: decryptedIban,
      locale: updated.locale || 'en',
      role: updated.role || 'user'
    };

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: 'Current password and new password are required' });
    }

    if (!isValidPassword(newPassword)) {
      return res
        .status(400)
        .json({ error: 'New password must be at least 6 characters long' });
    }

    const db = getDatabase();

    // Get current user with password
    const user = (
      await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    ).rows[0];

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await db.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, req.user.id]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
