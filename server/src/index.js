// server/src/index.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { getHostsForOperation, getTripwiresByHost } from './h3.js';

const PORT = Number(process.env.PORT || 8080);   // use 8080 since you tested there
const HOST = process.env.HOST || '0.0.0.0';

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
  app.get('/health',  (_, res) => res.json({ ok: true })); // alias

  // NEW: list hosts that have tripwires for a given operation
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

  // Existing: Threat Actors (Tripwires) by host
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

  // catch-all
  app.use((req, res) => res.status(404).json({ error: 'not found' }));

  return app;
}

const app = createApp();
app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
});
