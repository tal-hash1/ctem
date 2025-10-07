// server/src/index.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { getTripwiresByHost } from './h3.js';

const PORT = process.env.PORT || 4000;

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/healthz', (_, res) => res.json({ ok: true }));

  // === New route: Tripwire Threat Actors by host ===
  app.get('/api/h3/threat-actors', async (req, res) => {
    try {
      const op_id = String(req.query.op_id || '').trim();
      const host_id = String(req.query.host_id || '').trim();
      if (!op_id || !host_id) {
        return res.status(400).json({ error: 'missing op_id or host_id' });
      }
      const actors = await getTripwiresByHost({ op_id, host_id });
      res.json({ ok: true, actors });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  return app;
}

const app = createApp();
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
