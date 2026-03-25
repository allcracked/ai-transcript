import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { toNodeHandler } from 'better-auth/node';

import { auth } from './auth';
import { requireAuth } from './middleware/auth';
import jobsRouter from './routes/jobs';
import transcriptsRouter from './routes/transcripts';
import adminRouter from './routes/admin';
import rubricsRouter from './routes/rubrics';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allow localhost in dev, or any origins specified via ALLOWED_ORIGINS env var
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Better Auth handler — must be before express.json() and any auth middleware
app.all('/api/auth/*', toNodeHandler(auth));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// All routes below require authentication
app.use('/api', requireAuth);

app.use('/api/jobs', jobsRouter);
app.use('/api/transcripts', transcriptsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/rubrics', rubricsRouter);

// Serve React frontend (production build copied to dist/public by Dockerfile)
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
