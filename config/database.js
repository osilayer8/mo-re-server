import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

export const initDatabase = async () => {
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

  console.log('Database initialized successfully');
  return db;
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

export default { initDatabase, getDatabase };
