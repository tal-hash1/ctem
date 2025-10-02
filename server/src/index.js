// server/src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAttackPaths, getAdaptCache } from './h3.js';

// __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(morgan('dev'));

// allow browser access (tweak origin as needed)
app.use(cors({ origin: (o, cb) => cb(null, o || true), credentials: true }));
app.options('*', cors());

// ---------------------- Health & Diagnostics ----------------------
app.get('/', (req, res) => res.json({ ok: true }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/hello', (_req, res) => res.json({ message: 'CTEM up' }));
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`CTEM server listening on ${port}`));
app.get('/diag', async (req, res) => {
  try {
    const cacheState = [];
    for (const [k, v] of getAdaptCache()) cacheState.push({ key: k, variant: v });
    res.json({ ok: true, cache: cacheState });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/diag/cache', async (req, res) => {
  try {
    const cacheState = [];
    for (const [k, v] of getAdaptCache()) cacheState.push({ key: k, variant: v });
    res.json({ cache: cacheState });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get('/diag/attack-paths', async (req, res) => {
  try {
    const op_id = req.query.op_id;
    const page_num = Number(req.query.page_num || 1);
    const page_size = Number(req.query.page_size || 100);
    if (!op_id) return res.status(400).json({ error: 'op_id required' });
    const data = await runAttackPaths(op_id, page_num, page_size);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------- Primary API ----------------------

// Fetch attack paths (paged)
app.get('/api/h3/attack-paths', async (req, res) => {
  try {
    const op_id = req.query.op_id;
    if (!op_id) return res.status(400).json({ error: 'op_id required' });
    const page_num = Number(req.query.page_num || 1);
    const page_size = Number(req.query.page_size || 100);
    const data = await runAttackPaths(op_id, page_num, page_size);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Quick summary/count of CVEs found across paths
app.get('/api/h3/top-cves', async (req, res) => {
  try {
    const op_id = req.query.op_id;
    if (!op_id) return res.status(400).json({ error: 'op_id required' });

    const page = await runAttackPaths(op_id, 1, 500);
    const paths = page?.attack_paths || [];

    const re = /CVE-\d{4}-\d{4,7}/ig;
    const counts = new Map();

    for (const p of paths) {
      const blob = [
        p?.impact_description,
        p?.context_score_description_md,
        p?.context_score_description,
        p?.host_text,
        p?.attack_path_title,
        p?.name,
        p?.impact_title
      ].filter(Boolean).join('  ');
      if (!blob) continue;
      for (const m of blob.matchAll(re)) {
        const id = m[0].toUpperCase();
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }

    const items = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cve, count]) => ({ cve, count }));

    res.json({ op_id, items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Alias-aware “simulate remediation”: mark paths disrupted if they mention selected CVEs or aliases
app.post('/api/h3/simulate-remediation', async (req, res) => {
  try {
    const { op_id, vuln_ids } = req.body || {};
    if (!op_id) return res.status(400).json({ error: 'op_id required' });

    // Extend matches with common names/aliases
    const ALIASES = {
      'CVE-2017-0144': ['MS17-010', 'EternalBlue', 'ETERNAL BLUE'],
      'CVE-2020-1472': ['Zerologon', 'ZERO LOGON'],
      'CVE-2021-34527': ['PrintNightmare', 'PRINT NIGHTMARE'],
      'CVE-2022-26923': ['AD CS', 'Active Directory Certificate Services'],
      'CVE-2021-42278': ['sAMAccountName spoof', 'samaccountname spoof', 'sAMAccountName Spoofing'],
      // Extend with environment-specific aliases here
    };

    const expanded = new Set();
    for (const raw of (vuln_ids || [])) {
      const id = String(raw).toUpperCase();
      expanded.add(id);
      const al = ALIASES[id] || [];
      for (const a of al) expanded.add(String(a).toUpperCase());
    }

    const page = await runAttackPaths(op_id, 1, 500);
    const paths = page?.attack_paths || [];
    const disrupted = [];

    for (const p of paths) {
      const hay = [
        p?.impact_description,
        p?.context_score_description_md,
        p?.context_score_description,
        p?.host_text,
        p?.attack_path_title,
        p?.name,
        p?.impact_title
      ].filter(Boolean).join('  ').toUpperCase();

      let hit = false;
      for (const needle of expanded) {
        if (needle && hay.includes(needle)) { hit = true; break; }
      }
      if (hit) disrupted.push(p.uuid);
    }

    const total = paths.length, count = disrupted.length;
    const pct = total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
    res.json({ paths_total: total, paths_disrupted: count, disrupted_path_ids: disrupted, percent_reduction: pct });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// In-app CVE details: returns occurrences of the CVE across attack paths (no external sites)
app.get('/api/h3/cve-details', async (req, res) => {
  try {
    const op_id = req.query.op_id;
    const cve = (req.query.cve || '').toUpperCase();
    if (!op_id) return res.status(400).json({ error: 'op_id required' });
    if (!cve) return res.status(400).json({ error: 'cve required' });

    const page = await runAttackPaths(op_id, 1, 500);
    const paths = page?.attack_paths || [];

    const re = new RegExp(`\\b${cve}\\b`, 'i');
    const occurrences = [];

    for (const p of paths) {
      const hay = [
        p?.impact_description,
        p?.context_score_description_md,
        p?.context_score_description,
        p?.host_text,
        p?.attack_path_title,
        p?.name,
        p?.impact_title
      ].filter(Boolean).join('  ');

      if (hay && re.test(hay)) {
        occurrences.push({
          uuid: p.uuid,
          title: p.attack_path_title || p.name || null,
          impact_title: p.impact_title || null,
          impact_description: p.impact_description || null,
          context_score_description: p.context_score_description || null,
          context_score_description_md: p.context_score_description_md || null,
          hosts: p.hosts ?? p.host_text ?? null,
          created_at: p.created_at || null,
          severity: p.severity || null,
          score: p.score ?? p.base_score ?? null,
          vulns: p.vulns || p.vuln_ids || p.vulnerability_ids || null
        });
      }
    }

    res.json({
      summary: {
        cve,
        occurrence_count: occurrences.length,
        examples: occurrences.slice(0, 8).map(o => ({ uuid: o.uuid, title: o.title, hosts: o.hosts })),
      },
      occurrences
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------- Static Frontend Hosting ----------------------
// Serve the built React app that was copied to server/public in the Docker build
const PUBLIC_DIR = path.resolve(__dirname, '../public');
app.use(express.static(PUBLIC_DIR));

// Client-side routing fallback (kept AFTER API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ---------------------- Start Server ----------------------
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`server listening on :${PORT}`));

export default app;
