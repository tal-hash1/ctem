import React from 'react'

export default function MethodologyModal({ open, onClose }){
  if (!open) return null
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e=>e.stopPropagation()}>
        <div style={styles.header}>
          <div>How the numbers are calculated</div>
          <button style={styles.x} onClick={onClose}>✕</button>
        </div>
        <div style={{maxHeight:'60vh', overflow:'auto', lineHeight:1.5}}>
          <ol>
            <li><b>Top CVEs:</b> parsed from attack path fields (title/context/impact/host text) via regex <code>/CVE-\d{4}-\d{4,7}/</code>. Unique per path, then ranked by frequency.</li>
            <li><b>Simulation:</b> for selected CVEs, we mark attack paths as disrupted if their text contains any of the chosen CVE IDs (case-insensitive). This approximates remediation effect.</li>
            <li><b>% Reduction:</b> <code>(disrupted_paths / total_paths) * 100</code>, rounded to one decimal.</li>
            <li><b>Attack Vector:</b> node with zero in-degree in the chain (or the first node if ambiguous). The movie seeds pulses from here.</li>
            <li><b>Crown Jewels:</b> heuristic match on keywords (Active Directory/DC, S3, KMS/Vault, RDS/DB, vCenter/ESXi, Exchange/O365). Can be customized per tenant.</li>
            <li><b>Kill Chain Highlight:</b> after simulation we remove disrupted nodes and compute reachability from the attack vector. Reachable edges/nodes are bright; cut links are red; unreachable are dimmed.</li>
            <li><b>Hostname Labels (Unique):</b> only the first occurrence of a hostname is labeled on-canvas; duplicates are shown via tooltip counts to avoid clutter.</li>
          </ol>
          <div style={{marginTop:8, opacity:.8, fontSize:12}}>
            Notes: This app doesn’t modify Horizon3.ai data; it visualizes it. For exact GraphQL sources and strict per-path calculations, wire the official per-path CVE fields when available.
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  backdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'grid', placeItems:'center', zIndex:1000, padding:16 },
  modal: { width:'min(840px, 96vw)', background:'#0f1720', border:'1px solid #1f2937', borderRadius:16, padding:16, boxShadow:'0 10px 40px rgba(0,0,0,.5)' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, fontWeight:700 },
  x: { background:'transparent', color:'#e5e7eb', border:'1px solid #374151', borderRadius:8, padding:'4px 8px', cursor:'pointer' }
}
