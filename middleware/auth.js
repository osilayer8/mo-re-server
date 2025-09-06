import { verifyToken } from '../utils/auth.js';
import { getDatabase } from '../config/database.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify user exists in database
    const db = getDatabase();
    const user = (
      await db.query(
        'SELECT id, email, first_name, last_name, role FROM users WHERE id = $1',
        [decoded.userId]
      )
    ).rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Optional authentication - won't fail if no token provided
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        const db = getDatabase();
        const user = (
          await db.query(
            'SELECT id, email, first_name, last_name, role FROM users WHERE id = $1',
            [decoded.userId]
          )
        ).rows[0];
        if (user) {
          req.user = user;
        }
      }
    }
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};
