// web/src/pages/app.jsx
import React, { useEffect, useMemo, useState } from 'react'
import AttackPath2D from '../components/AttackPath2D.jsx'
import AttackPath3D from '../components/AttackPath3D.jsx'
import PathDetails from '../components/PathDetails.jsx'
import CVEAnimationModal from '../components/CVEAnimationModal.jsx'
import { VirtualCJ, VirtualPaths } from '../components/VirtualLists.jsx'
import MethodologyModal from '../components/MethodologyModal.jsx'
import { getAttackPaths, getTopCVEs, simulate, API_DEBUG } from '../lib/api.js'
import CVEDetailsModal from '../components/CVEDetailsModal.jsx'

const SEV_COLOR = { CRITICAL:'#ef4444', HIGH:'#f59e0b', MEDIUM:'#60a5fa', LOW:'#34d399', INFO:'#94a3b8' }
const CJ_PATTERNS = [
  /active\s*directory|domain\s*controller|\bdc\b|ad\s*ds|krbtgt/i,
  /\bs3\b|object\s*storage|bucket/i,
  /kms|key\s*vault|hashicorp\s*vault/i,
  /rds|sql\s*server|postgres|oracle\s*db|mongodb/i,
  /vcenter|esxi|vmware/i,
  /exchange\s*server|o365|m365/i
]

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

export default function App(){
  const [mode3d, setMode3d] = useState(true)
  const [labelMode, setLabelMode] = useState('HOST') // HOST | HOST_UNIQUE | CVE | TITLE | NONE
  const [opId, setOpId] = useState(import.meta.env.VITE_SAMPLE_OP_ID || '')
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
  const [autoZoom, setAutoZoom] = useState(true)

  // Build nodes and text blob
  const baseNodes = useMemo(()=> (page?.attack_paths||[]).map(p => {
    const blob = [p.attack_path_title, p.name, p.impact_description, p.context_score_description_md, p.context_score_description, p.host_text, p.host_name].filter(Boolean).join(' ')
    const m = blob.match(/CVE-\d{4}-\d{4,7}/i)
    return {
      id: p.uuid,
      label: p.attack_path_title || p.name,
      severity: p.severity,
      score: p.score,
      host: p.host_name || p.affected_asset_short_text || p.target_entity_short_text,
      blob,
      cveTag: m ? m[0].toUpperCase() : undefined
    }
  }),[page])

  // Hostname de-dup stats
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

  // Connectivity (reachable set after removing disrupted)
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

  // --- 3D tour control ---
  const graph3dRef = React.useRef(null)
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

  async function loadAll(){
    setLoading(true); setLoadError(null)
    try {
      const p = await getAttackPaths(opId); setPage(p)
      const t = await getTopCVEs(opId); setCves(t.cves || t.items || [])
      setSelected(null)
    } catch(e){ setLoadError(e?.message || String(e)) }
    finally { setLoading(false) }
  }
  useEffect(()=>{ if (opId) loadAll() },[])

  async function runSim(vulnIds){
    try {
      const s = await simulate(opId, vulnIds); setSim(s)
      if (autoZoom && mode3d) { setTimeout(runCinematicAfterSim, 50) }
    } catch(e){ setLoadError(e?.message || String(e)) }
  }

  const percentTip = `Tooltip: (disrupted / total) * 100 = (${sim.paths_disrupted} / ${sim.paths_total}) * 100 = ${sim.percent_reduction}%`

  return (
  <div className="app" style={{ paddingBottom: 56 }}>
    {/* LEFT: lists & controls */}
    <div className="col list">
      <div className="card">
        <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="OP UUID"
            value={opId}
            onChange={e => setOpId(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="btn" onClick={loadAll} disabled={loading}>
            {loading ? 'Loading…' : 'Load'}
          </button>
          <label className="btn" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={mode3d} onChange={() => setMode3d(!mode3d)} /> 3D
          </label>

          <div className="toolbar-right">
            <button className="btn" onClick={() => startTour()} disabled={!mode3d || tourPlaying}>
              Bird’s-eye Tour
            </button>
            <button className="btn" onClick={() => stopTour()} disabled={!tourPlaying}>
              Stop Tour
            </button>
            <button className="btn" onClick={() => setShowMovie(true)}>Visualize Attack Path</button>
            <label className="btn" title="Auto camera path after simulation">
              <input type="checkbox" checked={autoZoom} onChange={()=>setAutoZoom(!autoZoom)} /> Auto-zoom
            </label>
          </div>
        </div>

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

      {/* CVE card */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><b>Vulnerabilities (CVE)</b></div>
          <div className="muted">Select CVEs, then run simulation</div>
        </div>

        {/* CVE chips (no auto-run) */}
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
                  }}
                >
                  {id} {c.freq ? `· ${c.freq} paths` : ''}
                </button>
              );
            });
          })()}
        </div>

        {/* Actions under chips */}
        <div style={{ marginTop: 6, display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn" onClick={() => runSim(selectedCVEs)} disabled={selectedCVEs.length===0}>
            Run Simulation
          </button>
          {cves.length > 10 && (
            <button className="btn" onClick={() => setShowAllCVEs(!showAllCVEs)}>
              {showAllCVEs ? 'Show fewer CVEs' : `Show more (${cves.length - 10})`}
            </button>
          )}
        </div>

        {/* Simulation result + Reset + Explain Calculation */}
        <div className="row" style={{ gap: 12, marginTop: 8, alignItems:'center' }}>
          <div className="card" style={{ flex: 1 }} title={percentTip}>
            <div className="muted">Simulation</div>
            <div style={{ fontSize: '1.8rem', marginTop: 4 }}>{sim.percent_reduction}%</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Paths disrupted: {sim.paths_disrupted} / {sim.paths_total}
            </div>
          </div>
          <button
            className="btn"
            onClick={() => { setSelectedCVEs([]); runSim([]) }}
          >
            Reset
          </button>
          <button className="btn" onClick={() => setShowMethod(true)} title="How we calculate risk">
            Explain Calculation
          </button>
        </div>
      </div>

      {/* Crown Jewels */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Crown Jewels</div>
        <VirtualCJ items={crownJewels} connectedMap={connectedMap} height={360} />
      </div>

      {/* Attack Paths */}
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

    {/* MIDDLE: 3D/2D graph with legend overlay */}
    <div className="col grow">
      <div className="card graph" style={{ position:'relative' }}>
        <div className="graph-viewport">
          {mode3d ? (
            <AttackPath3D
              ref={graph3dRef}
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

        {/* Legend — bottom-right overlay */}
        <div style={{
          position:'absolute', right:12, bottom:12, zIndex:5,
          background:'rgba(17,24,39,0.82)', // slate-900-ish with opacity
          border:'1px solid rgba(148,163,184,0.35)', // slate-400-ish
          borderRadius:10, padding:'10px 12px', minWidth:180,
          boxShadow:'0 6px 18px rgba(0,0,0,0.35)', backdropFilter:'blur(2px)'
        }}>
          <div style={{ fontWeight:700, fontSize:12, color:'#e5e7eb', marginBottom:6 }}>Legend</div>

          {[
            { c: SEV_COLOR.CRITICAL, label:'Critical (Red)' },
            { c: SEV_COLOR.HIGH,     label:'High (Yellow/Amber)' },
            { c: SEV_COLOR.MEDIUM,   label:'Medium (Blue)' },
            { c: SEV_COLOR.LOW,      label:'Low (Green)' },
            { c: SEV_COLOR.INFO,     label:'Info (Gray)' },
          ].map((row) => (
            <div key={row.label} style={{ display:'flex', alignItems:'center', gap:8, margin:'4px 0' }}>
              <span style={{
                display:'inline-block', width:12, height:12, borderRadius:'50%',
                background: row.c, border:'1px solid rgba(0,0,0,0.35)'
              }}/>
              <span style={{ color:'#e5e7eb', fontSize:12 }}>{row.label}</span>
            </div>
          ))}

          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
            <span style={{
              display:'inline-block', width:12, height:12, borderRadius:'50%',
              background:'transparent', border:'2px dashed #fbbf24' // dashed gold ring
            }}/>
            <span style={{ color:'#fde68a', fontSize:12, fontWeight:600 }}>Crown Jewel</span>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
            <span style={{
              display:'inline-block', width:18, height:3, background:'#93c5fd'
            }}/>
            <span style={{ color:'#e5e7eb', fontSize:12 }}>Highlighted path</span>
          </div>
        </div>
      </div>
    </div>

    {/* RIGHT: diagnostics */}
    <div className="sidebar">
      <Diagnostics loadError={loadError} />
      <div className="card">
        <PathDetails row={selected} />
      </div>
    </div>

    {/* Footer (fixed bottom center) */}
    <div className="card" style={{
      position:'fixed', left:0, right:0, bottom:0,
      margin:'0 auto', maxWidth:800, textAlign:'center',
      opacity:0.9, padding:'8px 12px', backdropFilter:'blur(2px)'
    }}>
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
    <CVEDetailsModal />
  </div>
  );
}
