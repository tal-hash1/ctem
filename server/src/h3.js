// server/src/h3.js
import fetch from 'node-fetch';

const API_URL  = (process.env.H3_GRAPHQL_URL || '').trim();
const AUTH_URL = (process.env.H3_AUTH_URL    || '').trim();
const API_KEY  = (process.env.H3_API_KEY     || '').trim();

if (!API_URL)  console.warn('[h3] WARN: H3_GRAPHQL_URL not set');
if (!AUTH_URL) console.warn('[h3] WARN: H3_AUTH_URL not set');
if (!API_KEY)  console.warn('[h3] WARN: H3_API_KEY not set');

let cachedToken = null;
let tokenExp = 0;

async function getBearer() {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && now < tokenExp - 60) return cachedToken;

    const r = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ key: API_KEY })
    });

    const txt = await r.text().catch(() => '');
    if (!r.ok) throw new Error(`Auth failed ${r.status}: ${txt}`);

    let json; try { json = JSON.parse(txt); } catch { throw new Error(`Auth parse error: ${txt}`); }
    const token = String(json.token || '').trim();
    if (!token) throw new Error(`Auth ok but "token" missing: ${txt}`);

    cachedToken = token;
    tokenExp = now + (50 * 60); // refresh ~10m early
    return token;
}

export async function gql(query, variables = {}) {
    const bearer = await getBearer();
    const r = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            'authorization': `Bearer ${bearer}`
        },
        body: JSON.stringify({ query, variables })
    });

    const text = await r.text().catch(() => '');
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!r.ok) throw new Error(`GraphQL HTTP ${r.status}: ${text}`);
    if (json.errors?.length) throw new Error(JSON.stringify(json, null, 2));
    return json.data;
}

export async function debugAuth() {
    try {
        const token = await getBearer();
        const data = await gql('query { __typename }', {});
        return { ok: true, has_token: !!token, typename: data?.__typename || null };
    } catch (e) {
        return { ok: false, error: String(e?.message || e) };
    }
}

/* ===================== Attack Paths ===================== */
export async function getAttackPathsPage(op_id, page_num = 1, page_size = 100, _opts = {}) {
    const collect = !!_opts.collect; // diagnostics mode
    const tried = [];

    const variants = [
        {
            name: 'v1_attack_paths_page_input_page_input',
            query: `
        query ($input: OpInput!, $page_input: PageInput) {
          attack_paths_page(input: $input, page_input: $page_input) {
            page_info { page_num page_size has_next total }
            attack_paths {
              id
              uuid
              name
              attack_path_title
              host_name
              host_text
              severity
              score
              impact_description
              context_score_description
              context_score_description_md
              nodes { id type label host { id ip hostname } }
              edges { id from_id to_id label technique_id }
            }
          }
        }`,
            variables: { input: { op_id }, page_input: { page_num, page_size } },
            normalize: (d) => d.attack_paths_page
        },
        {
            name: 'v2_attack_paths_page_input_page_input_lean',
            query: `
        query ($input: OpInput!, $page_input: PageInput) {
          attack_paths_page(input: $input, page_input: $page_input) {
            page_info { page_num page_size }
            attack_paths {
              id
              uuid
              name
              attack_path_title
              host_name
              severity
              score
            }
          }
        }`,
            variables: { input: { op_id }, page_input: { page_num, page_size } },
            normalize: (d) => d.attack_paths_page
        },
        {
            name: 'v3_attack_paths_page_op_id_page_input',
            query: `
        query ($op_id: UUID!, $page_input: PageInput) {
          attack_paths_page(op_id: $op_id, page_input: $page_input) {
            items {
              id
              uuid
              name
              attack_path_title
              host_name
              severity
              score
            }
          }
        }`,
            variables: { op_id, page_input: { page_num, page_size } },
            normalize: (d) => ({ page_info: { page_num, page_size }, attack_paths: d.attack_paths_page?.items || [] })
        },
        {
            name: 'v4_attack_paths_page_input_page',
            query: `
        query ($input: OpInput!, $page: PageInput) {
          attack_paths_page(input: $input, page: $page) {
            page_info { page_num page_size }
            attack_paths {
              id
              uuid
              name
              attack_path_title
              host_name
              severity
              score
            }
          }
        }`,
            variables: { input: { op_id }, page: { page_num, page_size } },
            normalize: (d) => d.attack_paths_page
        },
        {
            name: 'v5_attack_paths_no_page',
            query: `
        query ($input: OpInput!) {
          attack_paths(input: $input) {
            id
            uuid
            name
            attack_path_title
            host_name
            severity
            score
            impact_description
            context_score_description
            context_score_description_md
          }
        }`,
            variables: { input: { op_id } },
            normalize: (d) => ({ page_info: { page_num: 1, page_size: (d.attack_paths||[]).length }, attack_paths: d.attack_paths || [] })
        },
        {
            name: 'v6_attack_paths_page_operation_id_in_input',
            query: `
        query ($input: OpInput!, $page_input: PageInput) {
          attack_paths_page(input: $input, page_input: $page_input) {
            page_info { page_num page_size }
            attack_paths {
              id
              uuid
              name
              attack_path_title
              host_name
              severity
              score
            }
          }
        }`,
            variables: { input: { operation_id: op_id }, page_input: { page_num, page_size } },
            normalize: (d) => d.attack_paths_page
        },
        {
            name: 'v7_operation_attack_paths_page_operation_id_page_input',
            query: `
        query ($operation_id: UUID!, $page_input: PageInput) {
          operation_attack_paths_page(operation_id: $operation_id, page_input: $page_input) {
            page_info { page_num page_size }
            attack_paths {
              id
              uuid
              name
              attack_path_title
              host_name
              severity
              score
            }
          }
        }`,
            variables: { operation_id: op_id, page_input: { page_num, page_size } },
            normalize: (d) => d.operation_attack_paths_page
        },
        // ---- TENANT-SAFE MINIMAL: no id, no has_next/total on PageInfo ----
        {
            name: 'v8_attack_paths_page_minimal_no_id',
            query: `
        query ($input: OpInput!, $page_input: PageInput) {
          attack_paths_page(input: $input, page_input: $page_input) {
            page_info { page_num page_size }
            attack_paths {
              uuid
              name
              attack_path_title
              host_name
              severity
              score
              impact_description
              context_score_description
              context_score_description_md
              ip
            }
          }
        }`,
            variables: { input: { op_id }, page_input: { page_num, page_size } },
            normalize: (d) => d.attack_paths_page
        },
    ];

    let lastErr = null;

    for (const v of variants) {
        try {
            const data = await gql(v.query, v.variables);
            const page = v.normalize(data) || {};
            const pi = page.page_info || {};
            const raw = page.attack_paths || [];

            // synthesize a stable `id` if backend does not return one
            const paths = raw.map((p) => ({
                id: p.id ?? p.uuid ?? p.name ?? p.ip ?? String(Math.random()).slice(2),
                ...p,
            }));

            if (collect) tried.push({ variant: v.name, ok: true });

            return {
                page_info: {
                    page_num: Number(pi.page_num ?? 1),
                    page_size: Number(pi.page_size ?? paths.length ?? page_size),
                    has_next: (typeof pi.has_next !== 'undefined') ? !!pi.has_next : undefined,
                    total: (typeof pi.total !== 'undefined') ? Number(pi.total) : undefined,
                    _variant: v.name
                },
                attack_paths: paths
            };
        } catch (e) {
            lastErr = e;
            if (collect) tried.push({ variant: v.name, ok: false, error: String(e?.message || e) });
        }
    }

    if (collect) return { _diagnostic: true, tried };
    throw new Error(`attack_paths_page failed across variants: ${String(lastErr?.message || lastErr)}`);
}

/* ===================== Top CVEs ===================== */
export async function getTopCVEsForOp(op_id, limit = 50) {
    const variants = [
        {
            name: 'v1_top_cves',
            query: `
        query top_cves($input: OpInput!, $limit: Int) {
          top_cves(input: $input, limit: $limit) { cve count }
        }`,
            variables: { input: { op_id }, limit },
            normalize: (d) => d.top_cves?.map(x => ({ cve: x.cve, count: x.count })) || []
        },
        {
            name: 'v2_top_weaknesses',
            query: `
        query top_weaknesses($input: OpInput!, $limit: Int) {
          top_weaknesses(input: $input, limit: $limit) { weakness_id count }
        }`,
            variables: { input: { op_id }, limit },
            normalize: (d) => d.top_weaknesses?.map(x => ({ cve: x.weakness_id, count: x.count })) || []
        },
    ];

    let lastErr = null;
    for (const v of variants) {
        try { const data = await gql(v.query, v.variables); return v.normalize(data); }
        catch (e) { lastErr = e; }
    }

    // Fallback – derive CVEs from attack path text
    try {
        const page = await getAttackPathsPage(op_id, 1, 200);
        const rx = /\bCVE-\d{4}-\d{4,7}\b/gi;
        const tally = new Map();
        for (const p of (page.attack_paths || [])) {
            const bag = [
                p.attack_path_title, p.name, p.impact_description,
                p.context_score_description, p.context_score_description_md
            ].filter(Boolean).join(' ');
            const m = bag.match(rx) || [];
            m.forEach(s => { const k = s.toUpperCase(); tally.set(k, (tally.get(k) || 0) + 1); });
        }
        return [...tally.entries()].sort((a,b)=>b[1]-a[1]).slice(0, limit)
            .map(([cve,count])=>({ cve, count }));
    } catch (e) {
        throw new Error(`top CVEs failed: ${String(lastErr?.message || lastErr || e)}`);
    }
}

/* ===================== Simulate Remediation ===================== */
export async function simulateRemediation(op_id, vuln_ids = []) {
    const variants = [
        {
            name: 'v1_mutation',
            query: `
        mutation simulate($input: OpInput!, $weakness_ids: [String!]!) {
          simulate_remediation(input: $input, weakness_ids: $weakness_ids) {
            paths_total
            paths_disrupted
            percent_reduction
            disrupted_path_ids
          }
        }`,
            variables: { input:{ op_id }, weakness_ids: vuln_ids },
            normalize: (d) => d.simulate_remediation
        }
    ];

    for (const v of variants) {
        try { const data = await gql(v.query, v.variables); return v.normalize(data); } catch { /* fallthrough */ }
    }

    // Fallback: local heuristic
    const page = await getAttackPathsPage(op_id, 1, 1000);
    const total = (page.attack_paths || []).length;
    const chosen = new Set((vuln_ids||[]).map(s=>String(s).toUpperCase()));
    const disruptedIds = [];
    for (const p of (page.attack_paths || [])) {
        const bag = [
            p.attack_path_title, p.name,
            p.impact_description, p.context_score_description, p.context_score_description_md
        ].filter(Boolean).join(' ').toUpperCase();
        for (const id of chosen) {
            if (bag.includes(id)) { disruptedIds.push(p.uuid || p.id || p.name); break; }
        }
    }
    const disrupted = disruptedIds.length;
    const percent = total ? Math.round(disrupted / total * 100) : 0;
    return { paths_total: total, paths_disrupted: disrupted, percent_reduction: percent, disrupted_path_ids: disruptedIds };
}

/* ===================== CVE Details ===================== */
export async function getCveDetails(op_id, cve) {
    const variants = [
        {
            name: 'v1_cve_details',
            query: `
        query cve_details($input: OpInput!, $cve: String!) {
          cve_details(input: $input, cve: $cve) {
            cve title description cvss references
          }
        }`,
            variables: { input: { op_id }, cve },
            normalize: (d) => d.cve_details
        }
    ];

    let lastErr = null;
    for (const v of variants) {
        try { const data = await gql(v.query, v.variables); return v.normalize(data); }
        catch (e) { lastErr = e; }
    }
    return { cve, title: cve, description: 'No details available', cvss: null, references: [] };
}

/* ===================== Hosts / Threat Actors (Tripwires) ===================== */
export async function getHostsForOperation(op_id, page_num = 1, page_size = 500) {
    const variants = [
        {
            name: 'v1_hosts_page',
            query: `
        query hosts_page($input: OpInput!, $page_input: PageInput) {
          hosts_page(input: $input, page_input: $page_input) {
            page_info { page_num page_size }
            hosts { id hostname ip }
          }
        }`,
            variables: { input: { op_id }, page_input: { page_num, page_size } },
            normalize: (d) => d.hosts_page?.hosts?.map(h=>({id:h.id,hostname:h.hostname,ip:h.ip})) || []
        },
        {
            name: 'v2_legacy',
            query: `
        query hosts_page($op_id: UUID!, $page_input: PageInput) {
          hosts_page(op_id: $op_id, page_input: $page_input) {
            items { id hostname ip }
          }
        }`,
            variables: { op_id, page_input: { page_num, page_size } },
            normalize: (d) => d.hosts_page?.items?.map(h=>({id:h.id,hostname:h.hostname,ip:h.ip})) || []
        },
    ];
    let lastErr = null;
    for (const v of variants) {
        try { const data = await gql(v.query, v.variables || {}); return v.normalize(data); }
        catch (e) { lastErr = e; }
    }
    throw new Error(`hosts_page failed: ${String(lastErr?.message || lastErr)}`);
}

export async function getTripwiresByHost(op_id, host_id, page_num = 1, page_size = 100) {
    const variants = [
        {
            name: 'v1_tripwires',
            query: `
        query tripwires_page($input: OpInput!, $filter_input: TripwireFilterInput, $page_input: PageInput) {
          tripwires_page(input: $input, filter_input: $filter_input, page_input: $page_input) {
            tripwires {
              id created_at severity actor rule_name technique_id description
              host { id hostname ip }
            }
          }
        }`,
            variables: { input: { op_id }, filter_input: { host_id }, page_input: { page_num, page_size } },
            normalize: (d) => d.tripwires_page?.tripwires || []
        },
        {
            name: 'v2_legacy',
            query: `
        query tripwires_page($op_id: UUID!, $filters: TripwiresFilters, $page: PageInput) {
          tripwires_page(op_id: $op_id, filters: $filters, page: $page) {
            items {
              id created_at severity actor rule_name technique_id description
              host { id hostname ip }
            }
          }
        }`,
            variables: { op_id, filters: { host_id }, page: { page_num, page_size } },
            normalize: (d) => d.tripwires_page?.items || []
        },
    ];
    let lastErr = null;
    for (const v of variants) {
        try { const data = await gql(v.query, v.variables || {}); return v.normalize(data); }
        catch (e) { lastErr = e; }
    }
    throw new Error(`tripwires_page failed: ${String(lastErr?.message || lastErr)}`);
}

export function getMeta() {
    return {
        H3_GRAPHQL_URL: API_URL || null,
        H3_AUTH_URL: AUTH_URL || null,
        has_api_key: Boolean(API_KEY),
    };
}
