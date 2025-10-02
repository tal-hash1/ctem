const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim();
const BASE = API_BASE || '';

export async function getAttackPaths(op_id) {
  const url = new URL((BASE || '') + '/api/h3/attack-paths', window.location.origin);
  url.searchParams.set('op_id', op_id);
  const r = await fetch(url.toString().replace(window.location.origin, ''));
  if (!r.ok) { const text = await r.text().catch(()=> ''); throw new Error('attack-paths failed: ' + text); }
  return r.json();
}

export async function getTopCVEs(op_id) {
  const url = new URL((BASE || '') + '/api/h3/top-cves', window.location.origin);
  url.searchParams.set('op_id', op_id);
  const r = await fetch(url.toString().replace(window.location.origin, ''));
  if (!r.ok) { const text = await r.text().catch(()=> ''); throw new Error('top-cves failed: ' + text); }
  return r.json();
}

export async function simulate(op_id, vuln_ids) {
  const path = (BASE || '') + '/api/h3/simulate-remediation';
  const r = await fetch(path, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ op_id, vuln_ids })
  });
  if (!r.ok) { const text = await r.text().catch(()=> ''); throw new Error('simulate failed: ' + text); }
  return r.json();
}

// NEW: in-app CVE details
export async function getCveDetails(op_id, cve) {
  const url = new URL((BASE || '') + '/api/h3/cve-details', window.location.origin);
  url.searchParams.set('op_id', op_id);
  url.searchParams.set('cve', cve);
  const r = await fetch(url.toString().replace(window.location.origin, ''));
  if (!r.ok) { const text = await r.text().catch(()=> ''); throw new Error('cve-details failed: ' + text); }
  return r.json();
}

export const API_DEBUG = { BASE, API_BASE };
