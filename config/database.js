// db.js
import { Pool } from 'pg';

let db;

export const initDatabase = async () => {
  if (!db) {
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // required for Render Postgres
      }
    });

    // optional: test connection
    await db.query('SELECT 1');
  }

  return db;
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

export default { initDatabase, getDatabase };
