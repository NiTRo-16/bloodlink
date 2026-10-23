import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import requestRoutes from './routes/requests.js';
import pushRoutes from './routes/push.js';
import { initRealtime } from './services/notify.js';
import { startExpiryJob } from './services/expiry.js';
import { proxyHops, securityHeaders } from './middleware/security.js';
import { apiLimit } from './middleware/rateLimits.js';

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error('Missing MONGO_URI or JWT_SECRET. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

if (process.env.RATE_LIMIT === 'off') console.warn('Rate limits are OFF (RATE_LIMIT=off). Never do this on a live site.');

const app = express();
app.set('trust proxy', proxyHops());
app.use(securityHeaders);
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', apiLimit);
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/push', pushRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app from the same server.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Turn every error into a clean JSON message.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Checked before err.status: the JSON parser's error has a status too, but its message is too technical to show.
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ error: first?.message || 'Invalid data' });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: `Invalid ${err.path}` });
  if (err.code === 11000) return res.status(409).json({ error: 'Already exists' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const server = http.createServer(app);
initRealtime(server, CLIENT_URL);

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    // Make sure the geo indexes exist before the first $near query.
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    server.listen(PORT, () => console.log(`BloodLink API running on http://localhost:${PORT}`));
    startExpiryJob();
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
