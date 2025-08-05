import express from 'express';
import cors from 'cors';
import { initDatabase } from './config/database.js';
import authRouter from './routes/auth.js';
import customersRouter from './routes/customers.js';
import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
await initDatabase();

// Routes
app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);
app.use('/api/customers/:customerId/projects', projectsRouter);
app.use('/api/customers/:customerId/projects/:projectId/tasks', tasksRouter);

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
