import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import logger from './utils/logger';
import initializeDatabase from './scripts/initDb';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import studentRoutes from './routes/studentRoutes';
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Dormitory Management System API' });
});

// Database initialization route (should be protected in production)
app.post('/init-db', async (req, res) => {
  try {
    await initializeDatabase();
    res.json({ message: 'Database initialized successfully' });
  } catch (error) {
    logger.error('Database initialization failed:', error);
    res.status(500).json({ error: 'Failed to initialize database' });
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start server
app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});

export default app;