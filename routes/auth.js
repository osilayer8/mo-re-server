import express from 'express';
import { getDatabase } from '../config/database.js';
import { encryptValue, decryptValue, maskIban, isEncryptionAvailable } from '../utils/encryption.js';
import { generateToken, hashPassword, comparePassword, isValidEmail, isValidPassword } from '../utils/auth.js';
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
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const db = getDatabase();

    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user (inactive by default) — include company/profile fields
    const result = await db.run(
      `INSERT INTO users (
        email, password, firstName, lastName,
        companyName, companyVatId, companyStreet, companyNumber, companyPostalCode, companyCity, companyState, companyCountry, companyPhone,
        locale, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      email.toLowerCase(), hashedPassword, firstName, lastName,
      companyName, companyVatId, companyStreet, companyNumber, companyPostalCode, companyCity, companyState, companyCountry, companyPhone,
      locale, 0
    );

    // Do not auto-login newly created users; return 201 and user id so operator can activate
    res.status(201).json({
      message: 'User created successfully (awaiting activation)',
      user: {
        id: result.lastID,
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
    const user = await db.get('SELECT * FROM users WHERE email = ?', email.toLowerCase());
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
        firstName: user.firstName,
        lastName: user.lastName,
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
  const row = await db.get(`SELECT id, email, firstName, lastName, companyName, companyStreet, companyNumber, companyPostalCode, companyCity, companyState, companyCountry, companyPhone, companyVatId, vatPercent, invoiceNumber, bankIbanCipher, bankIbanIv, bankIbanTag, bankName, bankBic, invoiceNotes, locale, active FROM users WHERE id = ?`, req.user.id);
    if (!row) return res.status(404).json({ error: 'User not found' });
    let decryptedIban = ''
    if (row.bankIbanCipher) {
      decryptedIban = decryptValue({ cipher: row.bankIbanCipher, iv: row.bankIbanIv, tag: row.bankIbanTag })
    }
  const user = {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      companyName: row.companyName,
      companyStreet: row.companyStreet,
      companyNumber: row.companyNumber,
      companyPostalCode: row.companyPostalCode,
      companyCity: row.companyCity,
      companyState: row.companyState,
      companyCountry: row.companyCountry,
      companyPhone: row.companyPhone,
      companyVatId: row.companyVatId,
  vatPercent: row.vatPercent ?? 0,
      invoiceNumber: row.invoiceNumber,
      bankName: row.bankName,
      bankBic: row.bankBic,
      invoiceNotes: row.invoiceNotes,
      bankIbanMasked: maskIban(decryptedIban),
  bankIban: decryptedIban, // full value for settings page
  locale: row.locale || 'en',
  active: row.active ? 1 : 0
    }
    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
  const { firstName, lastName, companyName = '', companyStreet = '', companyNumber = '', companyPostalCode = '', companyCity = '', companyState = '', companyCountry = '', companyPhone = '', companyVatId = '', vatPercent = 0, invoiceNumber = '', bankIban = '', bankName = '', bankBic = '', invoiceNotes = '', locale = 'en' } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    const db = getDatabase();

    let cipherFields = { bankIbanCipher: '', bankIbanIv: '', bankIbanTag: '' }
    if (bankIban) {
      if (isEncryptionAvailable()) {
        const normalized = bankIban.replace(/\s+/g,'').toUpperCase()
        const { cipher, iv, tag } = encryptValue(normalized)
        cipherFields = { bankIbanCipher: cipher, bankIbanIv: iv, bankIbanTag: tag }
      } else {
        // Store plaintext in cipher column (still better than failing) – will be re-encrypted later when key present
        cipherFields = { bankIbanCipher: bankIban, bankIbanIv: '', bankIbanTag: '' }
      }
    }

    await db.run(
      `UPDATE users SET firstName = ?, lastName = ?, companyName = ?, companyStreet = ?, companyNumber = ?, companyPostalCode = ?, companyCity = ?, companyState = ?, companyCountry = ?, companyPhone = ?, companyVatId = ?, vatPercent = ?, invoiceNumber = ?, bankIbanCipher = ?, bankIbanIv = ?, bankIbanTag = ?, bankName = ?, bankBic = ?, invoiceNotes = ?, locale = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      firstName, lastName, companyName, companyStreet, companyNumber, companyPostalCode, companyCity, companyState, companyCountry, companyPhone, companyVatId, vatPercent, invoiceNumber, cipherFields.bankIbanCipher, cipherFields.bankIbanIv, cipherFields.bankIbanTag, bankName, bankBic, invoiceNotes, locale, req.user.id
    );

  const updated = await db.get(`SELECT id, email, firstName, lastName, companyName, companyStreet, companyNumber, companyPostalCode, companyCity, companyState, companyCountry, companyPhone, companyVatId, vatPercent, invoiceNumber, bankIbanCipher, bankIbanIv, bankIbanTag, bankName, bankBic, invoiceNotes, locale, active FROM users WHERE id = ?`, req.user.id);
    let decryptedIban = ''
    if (updated.bankIbanCipher) {
      decryptedIban = decryptValue({ cipher: updated.bankIbanCipher, iv: updated.bankIbanIv, tag: updated.bankIbanTag })
    }
    const updatedUser = {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      companyName: updated.companyName,
      companyStreet: updated.companyStreet,
      companyNumber: updated.companyNumber,
      companyPostalCode: updated.companyPostalCode,
      companyCity: updated.companyCity,
      companyState: updated.companyState,
      companyCountry: updated.companyCountry,
      companyPhone: updated.companyPhone,
      companyVatId: updated.companyVatId,
  vatPercent: updated.vatPercent ?? 0,
      invoiceNumber: updated.invoiceNumber,
      bankName: updated.bankName,
      bankBic: updated.bankBic,
      invoiceNotes: updated.invoiceNotes,
      bankIbanMasked: maskIban(decryptedIban),
  bankIban: decryptedIban,
  locale: updated.locale || 'en'
    }

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
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const db = getDatabase();

    // Get current user with password
    const user = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await db.run(
      'UPDATE users SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      hashedNewPassword, req.user.id
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
