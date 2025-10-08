import React, { useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import useSize from '../components/useSize'
import { getCveDetails } from '../lib/api'

const SEV_COLOR = { CRITICAL:'#ef4444', HIGH:'#f59e0b', MEDIUM:'#60a5fa', LOW:'#34d399', INFO:'#94a3b8' }

const AttackPath3D = forwardRef(function AttackPath3D(props, ref){
  const {
    nodes=[], links=[],
    highlightIds=[],
    crownJewels=[],
    connectedMap={},
    reachableSet=new Set(),
    labelMode='HOST',
    hostCounts={},
    firstHostIdByName={},
    opId,                    // <-- required for CVE API
    onShowCveDetails         // <-- callback to open modal
  } = props

  const graphRef = useRef()
  const [wrapRef, { w, h }] = useSize()
  const data = useMemo(()=>({nodes, links}),[nodes,links])

  useImperativeHandle(ref, () => ({
    camera: () => graphRef.current?.camera(),
    scene: () => graphRef.current?.scene(),
    zoomToFit: (ms=600, px=40) => graphRef.current?.zoomToFit(ms, px),
    flyOverview: (ms=900, dist=160) => {
      const cam = graphRef.current?.camera()
      if (!cam) return
      const start = { x: cam.position.x, y: cam.position.y, z: cam.position.z }
      const end = { x: 0, y: 0, z: dist }
      const t0 = performance.now()
      function tick(t){
        const k = Math.min(1, (t - t0)/ms)
        cam.position.set(
          start.x + (end.x - start.x)*k,
          start.y + (end.y - start.y)*k,
          start.z + (end.z - start.z)*k
        )
        if (k < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    flyToNode: (nodeId, ms=900, dist=140) => {
      const cam = graphRef.current?.camera()
      const api = graphRef.current
      if (!cam || !api) return
      const pos = api.getGraphBbox()
      const obj = api.getObjectById(nodeId)
      if (!obj) return
      const p = new THREE.Vector3()
      obj.getWorldPosition(p)
      cam.position.set(p.x + dist, p.y + dist, p.z + dist)
    },
    flyToNodeSmooth: (nodeId, ms=900, dist=140, done) => {
      const cam = graphRef.current?.camera()
      const api = graphRef.current
      if (!cam || !api) return done?.()
      const obj = api.getObjectById(nodeId)
      if (!obj) return done?.()
      const p = new THREE.Vector3()
      obj.getWorldPosition(p)
      const start = { x: cam.position.x, y: cam.position.y, z: cam.position.z }
      const end = { x: p.x + dist, y: p.y + dist, z: p.z + dist }
      const t0 = performance.now()
      function tick(t){
        const k = Math.min(1, (t - t0)/ms)
        cam.position.set(
          start.x + (end.x - start.x)*k,
          start.y + (end.y - start.y)*k,
          start.z + (end.z - start.z)*k
        )
        if (k < 1) requestAnimationFrame(tick)
        else done?.()
      }
      requestAnimationFrame(tick)
    }
  }))

  useEffect(()=>{ graphRef.current?.zoomToFit(600, 40) },[nodes])

  const labelFor = (n) => {
    if (labelMode==='HOST_UNIQUE'){
      if (firstHostIdByName[n.host] !== n.id) return '' // only label first occurrence
      const count = hostCounts[n.host] || 1
      return n.host ? (count>1 ? `${n.host} (x${count})` : n.host) : (n.label || n.id)
    }
    if (labelMode==='HOST') return n.host || n.label || n.id
    if (labelMode==='CVE') return n.cves?.[0] || n.label || n.id
    if (labelMode==='TITLE') return n.label || n.id
    return ''
  }

  const CJ = new Set(crownJewels.map(c=>c.id))

  async function handleNodeClick(node){
    // find a CVE on the node; first in list if present
    let cve = node?.cves?.[0] || node?.cve || node?.cveTag || node?.cve_id || null
    if (!cve && node?.label) {
      const m = node.label.match(/\bCVE-\d{4}-\d{4,7}\b/i)
      if (m) cve = m[0].toUpperCase()
    }
    if (!cve || !opId) return

    try {
      const payload = await getCveDetails(opId, cve.toUpperCase())
      onShowCveDetails?.(payload)
    } catch (e) {
      console.error('CVE details fetch failed', e)
    }
  }

  return (
    <div ref={wrapRef} style={{ width:'100%', height:'100%' }}>
      <ForceGraph3D
        ref={graphRef}
        width={w}
        height={h}
        graphData={data}
        onEngineReady={() => {
          const cam = graphRef.current.camera(); cam.position.set(0, 0, 220)
          const scene = graphRef.current.scene()
          scene.fog = new THREE.Fog(0x0f1720, 250, 900)
          scene.background = new THREE.Color('#0f1720')
          const amb = new THREE.AmbientLight(0xffffff, 0.55)
          const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(120, 160, 220)
          scene.add(amb, dir)
        }}
        nodeLabel={n => {
          const base = labelFor(n) || (n.host || n.label)
          const sev = n.severity ? ` [${n.severity}]` : ''
          return `${base || n.id}${sev}`
        }}
        onNodeClick={handleNodeClick}
        nodeThreeObject={node => {
          const isCJ = CJ.has(node.id)
          const baseColor = isCJ ? (connectedMap[node.id] ? '#facc15' : '#fde68a') : (SEV_COLOR[node.severity] || '#a1a1aa')
          const faded = !reachableSet.has(node.id)
          const color = faded ? '#3a4551' : baseColor
          const geo = new THREE.SphereGeometry(isCJ ? 5.2 : 4, 18, 18)
          const mat = new THREE.MeshPhongMaterial({
            color,
            emissive: (isCJ ? 0x996515 : (highlightIds?.includes(node.id) ? 0xffffff : 0x000000)),
            emissiveIntensity: isCJ ? 0.35 : (highlightIds?.includes(node.id) ? 0.6 : 0.14),
            shininess: isCJ ? 80 : 60,
            transparent: true,
            opacity: faded ? 0.55 : 0.96
          })
          const mesh = new THREE.Mesh(geo, mat)
          // halo
          const tex = new THREE.TextureLoader().load('data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="white"/></svg>'))
          const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: faded ? 0.08 : 0.18, blending: THREE.AdditiveBlending })
          const halo = new THREE.Sprite(spriteMat); halo.scale.set(isCJ ? 28 : 22, isCJ ? 28 : 22, 1)
          mesh.add(halo)
          return mesh
        }}
        linkDirectionalParticles={0}
        linkResolution={4}
        linkOpacity={l => l.cut ? 0.95 : (reachableSet.has(l.source?.id || l.source) && reachableSet.has(l.target?.id || l.target) ? 0.6 : 0.15)}
        linkColor={l => l.cut ? 'red' : '#9aa4b2'}
        backgroundColor="#0f1720"
      />
    </div>
  )
})

export default AttackPath3D
