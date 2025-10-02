import React, { useEffect, useMemo, useRef } from 'react'

export default function CVEAnimationModal({ open, onClose, nodes=[], links=[], highlightIds=[], crownJewels=[], connectedMap={} }) {
  const cvs = useRef(null)

  const adj = useMemo(()=>{
    const m = new Map(), indeg = new Map()
    nodes.forEach(n => { m.set(n.id, []); indeg.set(n.id, 0) })
    links.forEach(l => {
      const s = l.source?.id || l.source
      const t = l.target?.id || l.target
      if (m.has(s) && m.has(t)) { m.get(s).push(t); indeg.set(t, (indeg.get(t)||0)+1) }
    })
    return { m, indeg }
  },[nodes,links])

  const seeds = useMemo(()=>{
    if (highlightIds && highlightIds.length) return new Set(highlightIds)
    const zero = [...adj.indeg.entries()].filter(([,d])=>d===0).map(([k])=>k)
    return new Set(zero.length ? [zero[0]] : (nodes[0] ? [nodes[0].id] : []))
  },[adj, nodes, highlightIds])

  const layers = useMemo(()=>{
    if (!seeds.size) return []
    const seen = new Set(seeds)
    const out = [ [...seeds] ]
    for (let k=0;k<8;k++){
      const prev = out[out.length-1] || []
      const next = new Set()
      prev.forEach(id => (adj.m.get(id)||[]).forEach(n => { if (!seen.has(n)) { next.add(n); seen.add(n) } }))
      if (!next.size) break
      out.push([ ...next ])
    }
    return out
  },[adj, seeds])

  useEffect(()=>{
    if (!open) return
    const ctx = cvs.current.getContext('2d')
    let raf; let t0;
    const DPR = Math.max(1, window.devicePixelRatio || 1)

    function draw(ts){
      if (!t0) t0 = ts
      const t = (ts - t0) / 1000
      const { width, height } = cvs.current
      ctx.clearRect(0,0,width,height)
      ctx.fillStyle = '#0f1720'; ctx.fillRect(0,0,width,height)

      // back links
      ctx.globalAlpha = 0.18
      ctx.strokeStyle = '#7b8794'; ctx.lineWidth = 1 * DPR
      links.forEach(l=>{
        const s = nodes.find(n=>n.id === (l.source?.id || l.source))
        const q = nodes.find(n=>n.id === (l.target?.id || l.target))
        if (!s||!q||s.x==null||q.x==null) return
        ctx.beginPath(); ctx.moveTo(s.x + width/2, s.y + height/2); ctx.lineTo(q.x + width/2, q.y + height/2); ctx.stroke()
      })

      // attack vector label
      const startId = layers?.[0]?.[0]
      const startNode = nodes.find(n=>n.id===startId)
      if (startNode){
        ctx.globalAlpha = 1
        ctx.fillStyle = '#1f2937'
        ctx.strokeStyle = '#3b82f6'
        const label = `Attack Vector: ${startNode.host || startNode.cveTag || startNode.label}`
        const pad = 8 * DPR
        ctx.font = `${12*DPR}px ui-sans-serif`
        const tw = ctx.measureText(label).width + pad*2
        const th = 22 * DPR
        ctx.beginPath()
        ctx.roundRect(width - tw - 16*DPR, 16*DPR, tw, th, 8*DPR)
        ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#e5e7eb'
        ctx.fillText(label, width - tw - 16*DPR + pad, 16*DPR + th - 8*DPR)
      }

      // crown jewels
      ctx.font = `${12*DPR}px ui-sans-serif`
      crownJewels.forEach(cj=>{
        const n = nodes.find(nn=>nn.id===cj.id)
        if (!n || n.x==null) return
        ctx.fillStyle = connectedMap[cj.id] ? '#facc15' : '#fde68a'
        ctx.beginPath(); ctx.arc(n.x + width/2, n.y + height/2, 5*DPR, 0, 2*Math.PI); ctx.fill()
        ctx.fillStyle = '#facc15'
        ctx.fillText(`[CJ] ${cj.label}`, n.x + width/2 + 8*DPR, n.y + height/2)
      })

      // pulse
      const layerPeriod = 0.55
      layers.forEach((ids, idx)=>{
        const phase = t - idx*layerPeriod
        if (phase < 0) return
        const prog = Math.min(1, phase / 0.7)
        const ease = prog<.5 ? 2*prog*prog : -1+(4-2*prog)*prog
        ids.forEach(id=>{
          const n = nodes.find(nn=>nn.id===id)
          if (!n || n.x==null) return
          const r = (8 + 60*ease) * DPR
          const alpha = Math.max(0, 0.7 - prog*0.7)
          const grad = ctx.createRadialGradient(n.x + width/2, n.y + height/2, Math.max(1, r*.2), n.x + width/2, n.y + height/2, r)
          grad.addColorStop(0, `rgba(96,165,250,${alpha})`)
          grad.addColorStop(1, `rgba(96,165,250,0)`)
          ctx.beginPath()
          ctx.arc(n.x + width/2, n.y + height/2, r, 0, 2*Math.PI)
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`
          ctx.lineWidth = 2 * DPR
          ctx.stroke()
          ctx.fillStyle = grad
          ctx.fill()
        })
      })

      raf = requestAnimationFrame(draw)
    }

    const resize = ()=>{
      const bb = cvs.current.getBoundingClientRect()
      const DPR = Math.max(1, window.devicePixelRatio || 1)
      cvs.current.width = Math.floor(bb.width * DPR)
      cvs.current.height = Math.floor(bb.height * DPR)
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(cvs.current)
    raf = requestAnimationFrame(draw)
    return ()=>{ cancelAnimationFrame(raf); ro.disconnect() }
  },[open, nodes, links, layers, highlightIds, crownJewels, connectedMap, seeds])

  if (!open) return null

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e=>e.stopPropagation()}>
        <div style={styles.header}>
          <div>Remediation Simulation</div>
          <button style={styles.x} onClick={onClose}>✕</button>
        </div>
        <div style={styles.canvasWrap}>
          <canvas ref={cvs} style={{ width:'100%', height:'100%', display:'block', borderRadius:12 }}/>
        </div>
        <div style={{opacity:.75, fontSize:12, marginTop:8}}>
          Starts at the <b>attack vector</b>. Gold dots mark <b>crown jewels</b>. Select CVEs to see disconnections.
        </div>
      </div>
    </div>
  )
}

const styles = {
  backdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'grid', placeItems:'center', zIndex:1000, padding:16 },
  modal: { width:'min(980px, 96vw)', background:'#0f1720', border:'1px solid #1f2937', borderRadius:16, padding:16, boxShadow:'0 10px 40px rgba(0,0,0,.5)' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, fontWeight:700 },
  x: { background:'transparent', color:'#e5e7eb', border:'1px solid #374151', borderRadius:8, padding:'4px 8px', cursor:'pointer' },
  canvasWrap: { width:'100%', height:'min(58vh, 520px)', background:'#0b1220', border:'1px solid #1f2937', borderRadius:12 }
}
