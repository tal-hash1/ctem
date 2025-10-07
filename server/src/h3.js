// server/src/h3.js
import fetch from 'node-fetch';

const H3_API_URL = process.env.H3_API_URL || 'https://docs.horizon3.ai/api/graphql';
const H3_API_TOKEN = process.env.H3_API_TOKEN || '';

if (!H3_API_TOKEN) {
  // You can still start the server, but calls will fail until you set this.
  console.warn('[h3] Warning: H3_API_TOKEN is not set. Set it to a valid Bearer token.');
}

async function gql(query, variables) {
  const r = await fetch(H3_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(H3_API_TOKEN ? { authorization: `Bearer ${H3_API_TOKEN}` } : {})
    },
    body: JSON.stringify({ query, variables })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`GraphQL HTTP ${r.status}: ${text}`);
  }
  const data = await r.json();
  if (data.errors) {
    throw new Error('GraphQL error: ' + JSON.stringify(data.errors));
  }
  return data.data;
}

const Q_TRIPWIRES_PAGE = `
  query TripwiresByHost($input: TripwiresPageInput!, $page_input: PageInput) {
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
 * Returns a compact list of { actor, created_at, severity, status, technique, rule_name, description }
 */
export async function getTripwiresByHost({ op_id, host_id }) {
  const variables = {
    input: { op_id, host_id },
    page_input: { page: 1, per_page: 50 }
  };
  const data = await gql(Q_TRIPWIRES_PAGE, variables);
  const items = data?.tripwires_page?.items ?? [];

  // Reduce to the latest tripwire per actor
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
