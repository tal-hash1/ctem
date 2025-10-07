// server/src/h3.js
import fetch from 'node-fetch';

const H3_API_URL = process.env.H3_API_URL || 'https://docs.horizon3.ai/api/graphql';
const H3_API_TOKEN = process.env.H3_API_TOKEN || '';

async function gql(query, variables) {
  const r = await fetch(H3_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(H3_API_TOKEN ? { authorization: `Bearer ${H3_API_TOKEN}` } : {})
    },
    body: JSON.stringify({ query, variables })
  });
  if (!r.ok) throw new Error(`GraphQL HTTP ${r.status}: ${await r.text().catch(()=> '')}`);
  const data = await r.json();
  if (data.errors) throw new Error('GraphQL error: ' + JSON.stringify(data.errors));
  return data.data;
}

/**
 * Tripwires page — adjust field names if your tenant differs.
 * We’ll use this for both "hosts for op" and "threat actors for host".
 */
const Q_TRIPWIRES_PAGE = `
  query TripwiresByFilter($input: TripwiresPageInput!, $page_input: PageInput) {
    tripwires_page(input: $input, page_input: $page_input) {
      items {
        id
        created_at
        severity
        status
        threat_actor
        technique
        rule_name
        description
        host { id hostname ip }
      }
      page_info { total page per_page }
    }
  }
`;

/**
 * Pull a unique list of hosts that have tripwires in the operation.
 * Returns: Array<{ id, hostname?, ip? }>
 */
export async function getHostsForOperation(op_id) {
  const data = await gql(Q_TRIPWIRES_PAGE, {
    input: { op_id },                 // if your schema needs a different key, adjust here
    page_input: { page: 1, per_page: 200 }
  });
  const items = data?.tripwires_page?.items ?? [];
  const map = new Map();
  for (const t of items) {
    const h = t.host || {};
    if (!h?.id) continue;
    if (!map.has(h.id)) map.set(h.id, { id: h.id, hostname: h.hostname || null, ip: h.ip || null });
  }
  return Array.from(map.values());
}

/**
 * Return compact Threat Actor info grouped by actor for a given op_id + host_id.
 * Output: Array<{ actor, created_at, severity, status, technique?, rule_name?, description? }>
 */
export async function getTripwiresByHost({ op_id, host_id }) {
  const data = await gql(Q_TRIPWIRES_PAGE, {
    input: { op_id, host_id },        // if your schema expects host_uuid or host_ids, tweak here
    page_input: { page: 1, per_page: 200 }
  });

  const items = data?.tripwires_page?.items ?? [];
  const actorMap = new Map();

  for (const t of items) {
    const actor = t.threat_actor || 'Unknown Actor';
    const prev = actorMap.get(actor);
    if (!prev || new Date(t.created_at) > new Date(prev.created_at)) {
      actorMap.set(actor, {
        actor,
        created_at: t.created_at,
        severity: t.severity,
        status: t.status,
        technique: t.technique || null,
        rule_name: t.rule_name || null,
        description: t.description || null
      });
    }
  }
  return Array.from(actorMap.values());
}
