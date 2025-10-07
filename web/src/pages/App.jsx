import React, { useEffect, useMemo, useState, useRef } from 'react'
import AttackPath2D from '../components/AttackPath2D.jsx'
import AttackPath3D from '../components/AttackPath3D.jsx'
import PathDetails from '../components/PathDetails.jsx'
import CVEAnimationModal from '../components/CVEAnimationModal.jsx'
import { VirtualCJ, VirtualPaths } from '../components/VirtualLists.jsx'
import MethodologyModal from '../components/MethodologyModal.jsx'
import { getAttackPaths, getTopCVEs, simulate, API_DEBUG } from '../lib/api.js'
import CVEDetailsModal from '../components/CVEDetailsModal.jsx'
import GraphLegend from '../components/GraphLegend.jsx'

const SEV_COLOR = { CRITICAL:'#ef4444', HIGH:'#f59e0b', MEDIUM:'#60a5fa', LOW:'#34d399', INFO:'#94a3b8' }
const CJ_PATTERNS = [
  /active\s*directory|domain\s*controller|\bdc\b|ad\s*ds|krbtgt/i,
  /\bs3\b|object\s*storage|bucket/i,
  /kms|key\s*vault|hashicorp\s*vault/i,
  /rds|sql\s*server|postgres|oracle\s*db|mongodb/i,
  /vcenter|esxi|vmware/i,
  /exchange\s*server|o365|m365/i
]

// ---------- CVE extraction (attach to nodes) ----------
const CVE_REGEX = /\bCVE-\d{4}-\d{4,7}\b/gi
function extractCVEsFromText(...parts){
  const seen = new Set()
  for (const p of parts){
    if (!p || typeof p !== 'string') continue
    const m = p.match(CVE_REGEX)
    if (m) m.forEach(s => seen.add(s.toUpperCase()))
  }
  return [...seen]
}

// ---------- Diagnostics widget ----------
function Diagnostics({ loadError }){
  const [res, setRes] = useState(null)
  useEffect(()=>{ (async()=>{
    try { const r = await fetch('/health'); setRes(await r.json()) } catch(e){ setRes({ ok:false, error:String(e) }) }
  })() },[])
  return <div className="card">
    <b>Diagnostics</b>
    <div className="muted">API_BASE: {String(API_DEBUG.API_BASE||'(relative /api)')}</div>
    <div className="muted">/health: {res? JSON.stringify(res): '...'}</div>
    {loadError && <div style={{marginTop:8, color:'#fecaca'}}><b>Last load error</b>: {String(loadError)}</div>}
  </div>
}

/** ---------- OP History (with names) ---------- */
const OP_HISTORY_KEY_V2 = 'ctem.opHistory.v2' // array of {id, name, savedAt}
const OP_HISTORY_MAX = 50

function useOpHistory() {
  const [history, setHistory] = useState([])

  // migrate from v1 (array of strings) if present
  useEffect(() => {
    try {
      const v2Raw = localStorage.getItem(OP_HISTORY_KEY_V2)
      if (v2Raw) {
        const arr = JSON.parse(v2Raw)
        if (Array.isArray(arr)) { setHistory(arr); return }
      }
      const v1Raw = localStorage.getItem('ctem.opHistory.v1')
      if (v1Raw) {
        const arrV1 = JSON.parse(v1Raw)
        if (Array.isArray(arrV1)) {
          const migrated = arrV1
            .filter(Boolean)
            .map(id => ({ id, name: '', savedAt: Date.now() }))
          localStorage.setItem(OP_HISTORY_KEY_V2, JSON.stringify(migrated))
          setHistory(migrated)
          return
        }
      }
    } catch {}
  }, [])

  const persist = (next) => {
    try { localStorage.setItem(OP_HISTORY_KEY_V2, JSON.stringify(next)) } catch {}
    setHistory(next)
  }

  const upsert = (id, name='') => {
    const trimmedId = String(id||'').trim()
    if (!trimmedId) return
    const trimmedName = String(name||'').trim()
    const now = Date.now()
    const existing = history.find(h => h.id === trimmedId)
    let next
    if (existing) {
      next = [{ id: trimmedId, name: trimmedName || existing.name, savedAt: now },
              ...history.filter(h => h.id !== trimmedId)]
    } else {
      next = [{ id: trimmedId, name: trimmedName, savedAt: now }, ...history]
    }
    persist(next.slice(0, OP_HISTORY_MAX))
  }

  const remove = (id) => persist(history.filter(h => h.id !== id))
  const clear = () => persist([])
  const rename = (id, newName='') => {
    const trimmedId = String(id||'').trim()
    const trimmedName = String(newName||'').trim()
    if (!trimmedId) return
    const now = Date.now()
    const next = history.map(h => h.id === trimmedId ? { ...h, name: trimmedName, savedAt: now } : h)
                        .sort((a,b)=> b.savedAt - a.savedAt)
    persist(next)
  }

  return { history, upsert, remove, clear, rename }
}

export default function App(){
  // Page title
  useEffect(() => { document.title = 'CTEM by Horizon3AI' }, [])

  const [mode3d, setMode3d] = useState(true)
  const [labelMode, setLabelMode] = useState('HOST') // HOST | HOST_UNIQUE | CVE | TITLE | NONE

  // --- OP UUID + Tenant Label ---
  const [opId, setOpId] = useState(import.meta.env.VITE_SAMPLE_OP_ID || '')
  const [opLabel, setOpLabel] = useState('') // tenant / friendly name
  const { history: opHistory, upsert: saveOp, remove: deleteOp, clear: clearOps, rename: renameOp } = useOpHistory()
  const [selectedSavedOpId, setSelectedSavedOpId] = useState('')

  const [page, setPage] = useState(null)
  const [cves, setCves] = useState([])
  const [selectedCVEs, setSelectedCVEs] = useState([])
  const [selected, setSelected] = useState(null)
  const [showAllCVEs, setShowAllCVEs] = useState(false)
  const [sim, setSim] = useState({paths_total:0, paths_disrupted:0, percent_reduction:0, disrupted_path_ids:[]})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [showMovie, setShowMovie] = useState(false)
  const [showMethod, setShowMethod] = useState(false)

  // Auto-zoom toggle (OFF by default)
  const [autoZoom, setAutoZoom] = useState(false)

  // CVE modal state (3D node click)
  const [cveModalOpen, setCveModalOpen] = useState(false)
  const [cveModalData, setCveModalData] = useState(null)

  // Build nodes + attach CVEs
  const baseNodes = useMemo(()=> (page?.attack_paths||[]).map(p => {
    const blob = [
      p.attack_path_title, p.name,
      p.impact_description,
      p.context_score_description_md,
      p.context_score_description,
      p.host_text, p.host_name
    ].filter(Boolean).join(' ')
    const cvesOnNode = extractCVEsFromText(blob)

    return {
      id: p.uuid,
      label: p.attack_path_title || p.name,
      severity: p.severity,
      score: p.score,
      host: p.host_name || p.affected_asset_short_text || p.target_entity_short_text,
      blob,
      cves: cvesOnNode
    }
  }),[page])

  // Host de-dup stats
  const { hostCounts, firstHostIdByName } = useMemo(()=>{
    const counts = {}; const first = {}
    baseNodes.forEach(n => {
      if (!n.host) return
      counts[n.host] = (counts[n.host] || 0) + 1
      if (!(n.host in first)) first[n.host] = n.id
    })
    return { hostCounts: counts, firstHostIdByName: first }
  },[baseNodes])

  // Crown jewels
  const crownJewels = useMemo(()=>{
    return baseNodes.filter(n => CJ_PATTERNS.some(rx => rx.test(n.blob))).map(n => ({ id:n.id, label:n.host || n.label }))
  },[baseNodes])

  // Use nodes/links
  const nodes = baseNodes
  const links = useMemo(()=>{ const arr=[]; for (let i=1;i<nodes.length;i++){ arr.push({ source: nodes[i-1]?.id, target: nodes[i]?.id }) } return arr },[nodes])

  // Connectivity after sim
  const reachableSet = useMemo(()=>{
    const disrupted = new Set(sim.disrupted_path_ids || [])
    const adj = new Map(); nodes.forEach(n => { if (!disrupted.has(n.id)) adj.set(n.id, []) })
    links.forEach(l => {
      const s = (l.source?.id || l.source), t = (l.target?.id || l.target)
      if (adj.has(s) && adj.has(t)) adj.get(s).push(t)
    })
    const indeg = new Map([...adj.keys()].map(k=>[k,0]))
    links.forEach(l=>{
      const s = (l.source?.id || l.source), t = (l.target?.id || l.target)
      if (indeg.has(t) && adj.has(s) && adj.has(t)) indeg.set(t, indeg.get(t)+1)
    })
    const start = [...indeg.entries()].find(([,d])=>d===0)?.[0] || nodes[0]?.id
    const q=[start]; const seen=new Set([start])
    while(q.length){ const u=q.shift(); (adj.get(u)||[]).forEach(v=>{ if(!seen.has(v)){ seen.add(v); q.push(v) } }) }
    return seen
  },[nodes, links, sim])

  const connectedMap = useMemo(()=>{
    const map={}
    crownJewels.forEach(cj => map[cj.id] = reachableSet.has(cj.id))
    return map
  },[crownJewels, reachableSet])

  // Tour / camera controls
  const graph3dRef = useRef(null)
  const [tourPlaying, setTourPlaying] = useState(false)
  const [tourIdx, setTourIdx] = useState(0)
  function getAttackVectorId(nodes){
    const av = nodes.find(n => n.attack_vector || n.role === 'ATTACK_VECTOR')
    if (av) return av.id
    const byIn = [...nodes].sort((a,b)=>(a.inDeg||0)-(b.inDeg||0))
    return byIn[0]?.id || nodes[0]?.id
  }
  function buildAdj(links){
    const adj = new Map()
    for (const l of links){
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      if (!adj.has(s)) adj.set(s, [])
      adj.get(s).push(t)
    }
    return adj
  }
  function shortestChain(start, targets, links, reachableSet){
    const targetSet = new Set(targets)
    const adj = buildAdj(links)
    const q = [start]
    const prev = new Map([[start, null]])
    while (q.length){
      const u = q.shift()
      if (targetSet.has(u)){
        const path = []
        let cur = u
        while (cur != null){ path.push(cur); cur = prev.get(cur) }
        return path.reverse()
      }
      const nbrs = adj.get(u) || []
      for (const v of nbrs){
        if (!reachableSet.has(v)) continue
        if (prev.has(v)) continue
        prev.set(v, u)
        q.push(v)
      }
    }
    return [start]
  }
  const tourPath = useMemo(()=> Array.from(reachableSet),[reachableSet])
  function startTour(){
    setTourPlaying(true); setTourIdx(0)
    graph3dRef.current?.flyOverview(1200, 180)
    setTimeout(()=> stepTour(0), 1300)
  }
  function stopTour(){ setTourPlaying(false) }
  async function runCinematicAfterSim(){
    if (!mode3d || !graph3dRef.current) return
    graph3dRef.current.flyOverview(900, 160)
    const startId = getAttackVectorId(nodes || [])
    await new Promise(r => setTimeout(r, 950))
    const connectedCJs = (crownJewels || []).filter(c => connectedMap[c.id])
    const targets = connectedCJs.length ? connectedCJs.map(c => c.id) : Array.from(reachableSet)
    const chain = shortestChain(startId, targets, links, reachableSet)
    for (let i=0; i<chain.length; i++){
      const n = chain[i]
      await new Promise(r => graph3dRef.current.flyToNodeSmooth(n, 1000, 140, r))
      await new Promise(r => setTimeout(r, 120))
    }
    graph3dRef.current.flyOverview(900, 160)
  }
  function stepTour(i){
    if (!tourPlaying) return
    const id = tourPath[i]; if (!id){ setTourPlaying(false); return }
    graph3dRef.current?.flyToNode(id, 1000, 140)
    setTourIdx(i+1)
    setTimeout(()=> stepTour(i+1), 1100)
  }

  const graphLinks = useMemo(()=> links.map(l=>{
    const s = (l.source?.id || l.source), t = (l.target?.id || l.target)
    const cut = (sim.disrupted_path_ids||[]).includes(s) || (sim.disrupted_path_ids||[]).includes(t)
    return { ...l, cut }
  }),[links, sim])

  // Data loaders
  async function loadAll(){
    setLoading(true); setLoadError(null)
    try {
      const p = await getAttackPaths(opId); setPage(p)
      const t = await getTopCVEs(opId); setCves(t.cves || t.items || [])
      setSelected(null)
      saveOp(opId, opLabel) // save current OP+label
    } catch(e){
      setLoadError(e?.message || String(e))
    } finally { setLoading(false) }
  }
  useEffect(()=>{ if (opId) loadAll() },[]) // auto-load if env sample present

  // Simulation
  async function runSim(vulnIds){
    try { 
      const s = await simulate(opId, vulnIds); 
      setSim(s); 
      if (autoZoom && mode3d) { setTimeout(runCinematicAfterSim, 50) }
    } catch(e){ setLoadError(e?.message || String(e)) }
  }

  const percentTip = `Tooltip: (disrupted / total) * 100 = (${sim.paths_disrupted} / ${sim.paths_total}) * 100 = ${sim.percent_reduction}%`

  return (
  <div className="app" style={{ paddingBottom: 72 }}>
    {/* LEFT: lists & controls */}
    <div className="col list">
      <div className="card">
        <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* OP UUID + Tenant/Label */}
          <input
            placeholder="OP UUID"
            value={opId}
            onChange={e => setOpId(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <input
            placeholder="Tenant / Label"
            value={opLabel}
            onChange={e => setOpLabel(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />

          <button className="btn" onClick={loadAll} disabled={loading}>
            {loading ? 'Loading…' : 'Load'}
          </button>

          {/* 3D toggle */}
          <label className="btn" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={mode3d} onChange={() => setMode3d(!mode3d)} /> 3D
          </label>

          {/* Auto-zoom toggle (OFF by default) */}
          <label className="btn" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={autoZoom} onChange={() => setAutoZoom(!autoZoom)} />
            Auto-zoom after evaluation
          </label>

          {/* Tour + Movie */}
          <button className="btn" onClick={() => setShowMovie(true)}>Visualize Attack Path</button>
          <button className="btn" onClick={() => startTour()} disabled={!mode3d || tourPlaying}>Bird’s-eye Tour</button>
          <button className="btn" onClick={() => stopTour()} disabled={!tourPlaying}>Stop Tour</button>
        </div>

        {/* Saved OPs */}
        <div className="row" style={{ marginTop: 8, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="muted">Saved OPs:</div>
          <select
            value={selectedSavedOpId}
            onChange={(e) => {
              const id = e.target.value
              setSelectedSavedOpId(id)
              const found = opHistory.find(h => h.id === id)
              if (found) { setOpId(found.id); setOpLabel(found.name || '') }
            }}
            style={{ minWidth: 300 }}
          >
            <option value="">— Select saved OP —</option>
            {opHistory.map(({ id, name }) => (
              <option key={id} value={id}>
                {name ? `${name} — ` : ''}{id}
              </option>
            ))}
          </select>

          <button className="btn" onClick={() => saveOp(opId, opLabel)} title="Save current OP UUID with label" disabled={!opId}>
            Save current
          </button>
          <button className="btn" onClick={() => { const t = selectedSavedOpId || opId; if (!t) return; renameOp(t, opLabel || '') }} title="Rename selected/current to label" disabled={!selectedSavedOpId && !opId}>
            Rename to label
          </button>
          <button className="btn" onClick={() => { const t = selectedSavedOpId || opId; if (!t) return; deleteOp(t); if (selectedSavedOpId === t) setSelectedSavedOpId('') }} title="Delete saved OP" disabled={!selectedSavedOpId && !opId}>
            Delete
          </button>
          <button className="btn" onClick={clearOps} title="Clear all saved OP UUIDs" disabled={opHistory.length === 0}>
            Clear all
          </button>
        </div>

        {/* Label mode */}
        <div className="row" style={{ marginTop: 8, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="muted">Labels:</div>
          <select value={labelMode} onChange={e => setLabelMode(e.target.value)}>
            <option value="HOST">Hostname</option>
            <option value="HOST_UNIQUE">Hostname (unique)</option>
            <option value="CVE">CVE</option>
            <option value="TITLE">Title</option>
            <option value="NONE">None</option>
          </select>
        </div>
      </div>

      {/* CVEs */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><b>Vulnerabilities (CVE)</b></div>
          <div className="muted">Select CVEs to evaluate</div>
        </div>

        {/* CVE chips (AUTO-RUN on click) */}
        <div>
          {(() => {
            const MAX = 10;
            const list = Array.isArray(cves)
              ? cves.map(c => c.cve ? { weakness_id: c.cve, freq: c.count } : c)
              : [];
            const arr = showAllCVEs ? list : list.slice(0, MAX);
            return arr.map(c => {
              const id = c.weakness_id || c.cve
              const active = selectedCVEs.includes(id);
              return (
                <button
                  key={id}
                  className="chip"
                  style={{ borderColor: active ? '#93c5fd' : '#1f2937', cursor: 'pointer' }}
                  onClick={() => {
                    const next = active
                      ? selectedCVEs.filter(x => x !== id)
                      : [...selectedCVEs, id];
                    setSelectedCVEs(next);
                    runSim(next); // ← auto-run on each click
                  }}
                >
                  {id} {c.freq ? `· ${c.freq} paths` : ''}
                </button>
              );
            });
          })()}
        </div>

        {/* Show more/less only (no manual button) */}
        <div style={{ marginTop: 6, display:'flex', gap:8, flexWrap:'wrap' }}>
          {cves.length > 10 && (
            <button className="btn" onClick={() => setShowAllCVEs(!showAllCVEs)}>
              {showAllCVEs ? 'Show fewer CVEs' : `Show more (${cves.length - 10})`}
            </button>
          )}
        </div>

        {/* Simulation result + Reset + Explain Calculation */}
        <div className="row" style={{ gap: 12, marginTop: 8, alignItems:'center' }}>
          <div className="card" style={{ flex: 1 }} title={percentTip}>
            <div className="muted">Evaluation</div>
            <div style={{ fontSize: '1.8rem', marginTop: 4 }}>{sim.percent_reduction}%</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Paths disrupted: {sim.paths_disrupted} / {sim.paths_total}
            </div>
          </div>
          <button className="btn" onClick={() => { setSelectedCVEs([]); runSim([]) }}>
            Reset
          </button>
          <button className="btn" onClick={() => setShowMethod(true)} title="How we calculate risk">
            Explain Calculation
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Crown Jewels</div>
        <VirtualCJ items={crownJewels} connectedMap={connectedMap} height={360} />
      </div>

      <div className="card grow">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Attack Paths</div>
        <VirtualPaths
          items={(page?.attack_paths || [])}
          onPick={p => setSelected(p)}
          sevColor={SEV_COLOR}
          height={420}
        />
      </div>
    </div>

    {/* MIDDLE: Graph */}
    <div className="col grow">
      <div className="card graph">
        <div className="graph-viewport" style={{ position: 'relative' }}>
          {/* Legend overlay bottom-right */}
          <GraphLegend style={{ top: 'auto', right: 12, bottom: 12 }}/>

          {mode3d ? (
            <AttackPath3D
              ref={graph3dRef}
              nodes={nodes}                 // each node includes cves:[]
              links={links}
              highlightIds={sim.disrupted_path_ids}
              labelMode={labelMode}
              crownJewels={crownJewels}
              connectedMap={connectedMap}
              reachableSet={reachableSet}
              hostCounts={hostCounts}
              firstHostIdByName={firstHostIdByName}
              opId={opId}                  // used by onNodeClick to fetch CVE details
              onShowCveDetails={(data) => { setCveModalData(data); setCveModalOpen(true); }}
            />
          ) : (
            <AttackPath2D
              nodes={nodes}
              links={links}
              highlightIds={sim.disrupted_path_ids}
              labelMode={labelMode}
              crownJewels={crownJewels}
              connectedMap={connectedMap}
              reachableSet={reachableSet}
              hostCounts={hostCounts}
              firstHostIdByName={firstHostIdByName}
            />
          )}
        </div>
      </div>
    </div>

    {/* RIGHT */}
    <div className="sidebar">
      <Diagnostics loadError={loadError} />
      <div className="card">
        <PathDetails row={selected} />
      </div>
    </div>

    {/* Fixed bottom-center footer */}
    <div
      className="card"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 12,
        transform: 'translateX(-50%)',
        textAlign: 'center',
        opacity: 0.9,
        maxWidth: 900,
        width: 'max-content',
        zIndex: 1000
      }}
    >
      CTEM — Continuous Threat Exposure Management • Created By Customer Success Team Horizon3AI
    </div>

    {/* Modals */}
    <CVEAnimationModal
      open={showMovie}
      onClose={() => setShowMovie(false)}
      nodes={nodes}
      links={links}
      highlightIds={sim.disrupted_path_ids}
    />
    <MethodologyModal open={showMethod} onClose={() => setShowMethod(false)} />

    {/* Opens on 3D node click */}
    <CVEDetailsModal
      open={cveModalOpen}
      onClose={() => setCveModalOpen(false)}
      data={cveModalData}
    />
  </div>
  );
}
