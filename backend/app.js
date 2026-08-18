import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import triageRoutes from './routes/triageRoutes.js';
import referralRoutes from './routes/referralRoutes.js';
import specialtyRoutes from './routes/specialtyRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initializeDatabase } from './config/database.js';

dotenv.config();
initializeDatabase();
const app = express();
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server requests and health checks without an Origin header.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
}));
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'triage-api' }));
app.use('/api/triage', triageRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/specialties', specialtyRoutes);
app.use(errorHandler);
export default app;
