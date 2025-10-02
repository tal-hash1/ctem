import fetch from 'node-fetch';

const H3_API_URL = process.env.H3_API_URL || 'https://api.gateway.horizon3ai.com/v1/graphql';
const H3_AUTH_URL = process.env.H3_AUTH_URL || 'https://api.gateway.horizon3ai.com/v1/auth';
const H3_API_KEY = process.env.H3_API_KEY;

let _jwt = null;
let _jwtExp = 0;
const ADAPT_CACHE = new Map();

export function getAdaptCache(){ return ADAPT_CACHE; }

async function mintJwt(){
  if (!H3_API_KEY) throw new Error('H3_API_KEY is not set');
  const r = await fetch(H3_AUTH_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: H3_API_KEY }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`[AUTH ${r.status}] ${text || 'no body'} @ ${H3_AUTH_URL}`);
  let token; try { token = JSON.parse(text).token } catch { throw new Error(`[AUTH parse] Expected {token}, got: ${text}`) }
  _jwt = token; _jwtExp = Date.now() + 50*60*1000; return _jwt;
}
async function getJwt(){ if (_jwt && Date.now() < _jwtExp) return _jwt; return mintJwt(); }

export async function rawGql(query, variables = {}){
  const jwt = await getJwt();
  const r = await fetch(H3_API_URL, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${jwt}`}, body: JSON.stringify({ query, variables }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`[GRAPHQL ${r.status}] ${text || 'no body'} @ ${H3_API_URL}`);
  let json; try { json = JSON.parse(text) } catch { throw new Error(`[GRAPHQL parse] ${text}`) }
  if (json.errors){ const msg = json.errors.map(e=>e.message).join('; '); const err = new Error(`[GRAPHQL errors] ${msg}`); err.graphQLErrors=json.errors; throw err; }
  return json.data;
}

const Q_ATTACK_PATHS_PAGE = (withPageInput) => `
query attack_paths_page($input: OpInput!${withPageInput?', $page_input: PageInput':''}) {
  attack_paths_page(input: $input${withPageInput?', page_input: $page_input':''}) {
    attack_paths {
      uuid op_id attack_path_title name
      impact_type impact_title impact_description
      base_score score severity
      context_score_description_md context_score_description
      created_at
      target_entity_text target_entity_short_text
      affected_asset_text affected_asset_short_text
      ip host_name host_text
    }
  }
}`;

export async function runAttackPaths(op_id, page_num=1, page_size=100){
  const cacheKey = 'attack_paths_page';
  const known = ADAPT_CACHE.get(cacheKey);
  const variants = known ? [ known ] : [
    { variant:'num', withPageInput:true, page_input:{ page_num, page_size } },
    { variant:'per', withPageInput:true, page_input:{ page: page_num, per_page: page_size } },
    { variant:'none', withPageInput:false }
  ];
  let lastErr;
  for (const v of variants){
    try {
      const data = await rawGql(Q_ATTACK_PATHS_PAGE(v.withPageInput), v.withPageInput ? { input:{ op_id }, page_input: v.page_input } : { input:{ op_id } });
      ADAPT_CACHE.set(cacheKey, v);
      return data.attack_paths_page;
    } catch(e){ lastErr = e; }
  }
  throw lastErr;
}
