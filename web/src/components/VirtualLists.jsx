import React from 'react'
import { FixedSizeList as List } from 'react-window'

export function VirtualCJ({ items, connectedMap, height=360, rowHeight=36 }){
  const Row = ({ index, style }) => {
    const cj = items[index]
    const connected = connectedMap[cj.id]
    return (
      <div style={{...style, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 8px'}}>
        <div style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{cj.label || cj.id}</div>
        <span className="badge" style={{borderColor: connected? '#14532d':'#7f1d1d', background: connected? '#052e1a':'#1a0b0b', color: connected? '#86efac':'#fecaca'}}>
          {connected? 'Connected':'Disconnected'}
        </span>
      </div>
    )
  }
  return <List height={height} itemCount={items.length} itemSize={rowHeight} width={'100%'}>{Row}</List>
}

export function VirtualPaths({ items, onPick, sevColor, height=420, rowHeight=48 }){
  const Row = ({ index, style }) => {
    const p = items[index]
    return (
      <div style={{...style, display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'center', padding:'0 8px', borderBottom:'1px solid #1f2937', cursor:'pointer'}} onClick={()=>onPick(p)}>
        <div style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.attack_path_title || p.name}</div>
        <span className="chip" style={{background:'#0b1220', borderColor: sevColor[p.severity] || '#1f2937', justifySelf:'center'}}>{p.severity}</span>
        <div style={{justifySelf:'end'}}>{Number(p.score ?? p.base_score).toFixed(2)}</div>
      </div>
    )
  }
  return <List height={height} itemCount={items.length} itemSize={rowHeight} width={'100%'}>{Row}</List>
}
