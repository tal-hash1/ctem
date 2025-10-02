import React, { useMemo, useRef, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useSize from '../components/useSize'

const SEV_COLOR = { CRITICAL:'#ef4444', HIGH:'#f59e0b', MEDIUM:'#60a5fa', LOW:'#34d399', INFO:'#94a3b8' }

export default function AttackPath2D({ nodes, links, highlightIds, labelMode='HOST', crownJewels=[], connectedMap={}, reachableSet=new Set(), hostCounts={}, firstHostIdByName={} }){
  const graphRef = useRef()
  const [wrapRef, { w, h }] = useSize()
  const data = useMemo(()=>({nodes, links}),[nodes,links])
  useEffect(()=>{ graphRef.current?.zoomToFit(600, 40) },[nodes])

  const labelFor = (n) => {
    if (labelMode==='HOST_UNIQUE'){
      if (firstHostIdByName[n.host] !== n.id) return '' // only label first occurrence
      const count = hostCounts[n.host] || 1
      return n.host ? (count>1 ? `${n.host} (x${count})` : n.host) : (n.label || n.id)
    }
    if (labelMode==='HOST') return n.host || n.label || n.id
    if (labelMode==='CVE') return n.cveTag || n.label || n.id
    if (labelMode==='TITLE') return n.label || n.id
    return ''
  }
  const CJ = new Set(crownJewels.map(c=>c.id))

  return <div ref={wrapRef} style={{width:'100%', height:'100%'}}>
    <ForceGraph2D ref={graphRef} graphData={data} width={w} height={h}
      nodeCanvasObject={(node, ctx, globalScale) => {
        const size = Math.max(4, 3 + (node.score||0)/50)
        const isCJ = CJ.has(node.id)
        const colorBase = isCJ ? (connectedMap[node.id] ? '#facc15' : '#fde68a') : (SEV_COLOR[node.severity] || '#a1a1aa')
        const faded = !reachableSet.has(node.id)
        const color = faded ? 'rgba(148,163,184,.25)' : colorBase
        ctx.beginPath(); ctx.arc(node.x, node.y, size, 0, 2*Math.PI, false)
        ctx.fillStyle = color; ctx.fill()
        if (isCJ){ ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.stroke() }
        const text = labelFor(node)
        if (!text) return
        const fontSize = 10 / Math.sqrt(globalScale)
        ctx.font = `${fontSize}px ui-sans-serif, system-ui`
        ctx.fillStyle = faded ? 'rgba(156,163,175,.4)' : '#9ca3af'
        ctx.fillText(text, node.x + size + 2, node.y + 2)
      }}
      linkColor={l => l.cut ? 'rgba(239,68,68,.85)' : (reachableSet.has(l.source?.id || l.source) && reachableSet.has(l.target?.id || l.target) ? 'rgba(148,163,184,.6)' : 'rgba(148,163,184,.2)')}
      linkWidth={l => l.cut ? 1.6 : .6}
      backgroundColor="#0f1720"
    />
  </div>
}
