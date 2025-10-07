// server/src/index.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getHostsForOperation, getTripwiresByHost } from './h3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

// Where your built frontend lives (adjust if different)
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../../web/dist');

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  // Health
  app.get('/healthz', (_, res) => res.json({ ok: true }));
  app.get('/health',  (_, res) => res.json({ ok: true }));

  // --- API ROUTES ---
  app.get('/api/h3/hosts', async (req, res) => {
    try {
      const op_id = String(req.query.op_id || '').trim();
      if (!op_id) return res.status(400).json({ error: 'missing op_id' });
      const hosts = await getHostsForOperation(op_id);
      res.json({ ok: true, hosts });
    } catch (e) {
      console.error('[hosts] error:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.get('/api/h3/threat-actors', async (req, res) => {
    try {
      const op_id = String(req.query.op_id || '').trim();
      const host_id = String(req.query.host_id || '').trim();
      if (!op_id || !host_id) return res.status(400).json({ error: 'missing op_id or host_id' });
      const actors = await getTripwiresByHost({ op_id, host_id });
      res.json({ ok: true, actors });
    } catch (e) {
      console.error('[threat-actors] error:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // --- STATIC FRONTEND (optional, only if build exists) ---
  if (fs.existsSync(STATIC_DIR)) {
    console.log(`[server] Serving static frontend from: ${STATIC_DIR}`);
    app.use(express.static(STATIC_DIR));

    // SPA fallback: for any non-API route, serve index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(STATIC_DIR, 'index.html'));
    });
  } else {
    console.warn(`[server] WARN: STATIC_DIR not found: ${STATIC_DIR}. Root (/) will 404 until you build the frontend.`);
    // For API unknowns, keep a JSON 404 (so curl / shows JSON, not a crash)
    app.use((req, res) => res.status(404).json({ error: 'not found' }));
  }

  return app;
}

const app = createApp();
app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
});
