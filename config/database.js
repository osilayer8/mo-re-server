import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db; // adapter exposing run/get/all

// Helper to create a small adapter around node-postgres Pool so existing code using db.run/db.get/db.all works
const createPgAdapter = (pool) => {
  // Convert sqlite-style '?' placeholders to Postgres $1,$2... placeholders
  const convert = (sql) => {
    let idx = 0
    return sql.replace(/\?/g, () => `$${++idx}`)
  }
  return {
    async get(sql, ...params) {
      const text = convert(sql)
      const res = await pool.query(text, params);
      return res.rows[0] || undefined;
    },
    async all(sql, ...params) {
      const text = convert(sql)
      const res = await pool.query(text, params);
      return res.rows;
    },
    // emulate sqlite's run returning { lastID }
    async run(sql, ...params) {
      // If INSERT without RETURNING, add RETURNING id so we can return lastID
      const isInsert = /^\s*INSERT\s+/i.test(sql) && !/RETURNING\s+/i.test(sql);
      let finalSql = sql;
      if (isInsert) finalSql = sql.replace(/;?\s*$/, '') + ' RETURNING id';
      const text = convert(finalSql)
      const res = await pool.query(text, params);
      return { lastID: res.rows[0] ? res.rows[0].id : undefined, changes: res.rowCount };
    }
  }
}

export const initDatabase = async () => {
  // If DATABASE_URL is present, use Postgres; otherwise use SQLite (existing behavior)
  if (process.env.DATABASE_URL) {
    // Lazy-import pg to avoid adding it when unused
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

    /* create tables in Postgres if they don't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      companyName TEXT DEFAULT '',
      companyStreet TEXT DEFAULT '',
      companyNumber TEXT DEFAULT '',
      companyPostalCode TEXT DEFAULT '',
      companyCity TEXT DEFAULT '',
      companyState TEXT DEFAULT '',
      companyCountry TEXT DEFAULT '',
      companyPhone TEXT DEFAULT '',
      companyVatId TEXT DEFAULT '',
      vatPercent REAL DEFAULT 0,
      invoiceNumber TEXT DEFAULT '',
      bankIbanCipher TEXT DEFAULT '',
      bankIbanIv TEXT DEFAULT '',
      bankIbanTag TEXT DEFAULT '',
      bankName TEXT DEFAULT '',
      bankBic TEXT DEFAULT '',
      invoiceNotes TEXT DEFAULT '',
      locale TEXT DEFAULT 'en',
      role TEXT DEFAULT 'user',
      active INTEGER DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);

    await pool.query(`CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      contactPerson TEXT DEFAULT '',
      billingStreet TEXT DEFAULT '',
      billingNumber TEXT DEFAULT '',
      billingPostalCode TEXT DEFAULT '',
      billingCity TEXT DEFAULT '',
      billingState TEXT DEFAULT '',
      billingCountry TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      vatNumber TEXT DEFAULT '',
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);

    await pool.query(`CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      customerId INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      invoiceNumber TEXT DEFAULT '',
      invoiceDate TEXT DEFAULT '',
      hourlyRate REAL DEFAULT 0,
      pricingType TEXT NOT NULL DEFAULT 'HOURLY',
      fixedPrice REAL DEFAULT 0,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);

    await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      projectId INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      estimatedHours REAL DEFAULT 1,
      completed INTEGER DEFAULT 0,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);
    */

    // Create adapter and assign to db
    db = createPgAdapter({ query: (...a) => pool.query(...a), queryRaw: pool.query, pool });

    return db;
  }

  // SQLite fallback (existing behavior)
  db = await open({
    filename: './data.db',
    driver: sqlite3.Database
  });

  // Create tables
  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
  companyName TEXT DEFAULT '',
  companyStreet TEXT DEFAULT '',
  companyNumber TEXT DEFAULT '',
  companyPostalCode TEXT DEFAULT '',
  companyCity TEXT DEFAULT '',
  companyState TEXT DEFAULT '',
  companyCountry TEXT DEFAULT '',
  companyPhone TEXT DEFAULT '',
  companyVatId TEXT DEFAULT '',
  vatPercent REAL DEFAULT 0,
  invoiceNumber TEXT DEFAULT '',
  bankIbanCipher TEXT DEFAULT '',
  bankIbanIv TEXT DEFAULT '',
  bankIbanTag TEXT DEFAULT '',
  bankName TEXT DEFAULT '',
  bankBic TEXT DEFAULT '',
  invoiceNotes TEXT DEFAULT '',
  locale TEXT DEFAULT 'en',
  role TEXT DEFAULT 'user',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contactPerson TEXT DEFAULT '',
    billingStreet TEXT DEFAULT '',
    billingNumber TEXT DEFAULT '',
    billingPostalCode TEXT DEFAULT '',
    billingCity TEXT DEFAULT '',
    billingState TEXT DEFAULT '',
    billingCountry TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    vatNumber TEXT DEFAULT '',
    userId INTEGER NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customerId INTEGER,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    invoiceNumber TEXT DEFAULT '',
  invoiceDate TEXT DEFAULT '',
    hourlyRate REAL DEFAULT 0,
    pricingType TEXT NOT NULL DEFAULT 'HOURLY',
    fixedPrice REAL DEFAULT 0,
    userId INTEGER NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customerId) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );`);

  // Ensure legacy databases have the invoiceNumber column
  const projectCols = await db.all(`PRAGMA table_info(projects);`)
  if (!projectCols.find(c => c.name === 'invoiceNumber')) {
    await db.exec(`ALTER TABLE projects ADD COLUMN invoiceNumber TEXT DEFAULT ''`)
  }
  // Ensure legacy databases have the invoiceDate column
  if (!projectCols.find(c => c.name === 'invoiceDate')) {
    await db.exec(`ALTER TABLE projects ADD COLUMN invoiceDate TEXT DEFAULT ''`)
  }

  // Ensure legacy databases have the vatPercent column
  const userCols = await db.all(`PRAGMA table_info(users);`)
  if (!userCols.find(c => c.name === 'vatPercent')) {
    await db.exec(`ALTER TABLE users ADD COLUMN vatPercent REAL DEFAULT 0`)
  }
  // Ensure legacy databases have the locale column
  if (!userCols.find(c => c.name === 'locale')) {
    await db.exec(`ALTER TABLE users ADD COLUMN locale TEXT DEFAULT 'en'`)
  }
  // Ensure legacy databases have the active column (0 = inactive, 1 = active)
  if (!userCols.find(c => c.name === 'active')) {
    await db.exec(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 0`)
  }
  // Ensure legacy databases have the role column (default 'user')
  if (!userCols.find(c => c.name === 'role')) {
    await db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`)
  }

  await db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER,
    name TEXT NOT NULL,
    estimatedHours REAL DEFAULT 1,
    completed INTEGER DEFAULT 0,
    userId INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );`);

  console.log('SQLite database initialized successfully');
  return db;
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

export default { initDatabase, getDatabase };
