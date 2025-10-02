import React from 'react'
import { marked } from 'marked'
export default function PathDetails({ row }){
  if (!row) return <div className="muted">Select a path…</div>
  return <div>
    <p><b>Title:</b> {row.attack_path_title || row.name}</p>
    <p><b>Impact:</b> {row.impact_title || row.impact_type}</p>
    <p><b>Severity:</b> {row.severity}</p>
    <p><b>Score:</b> {Number(row.score ?? row.base_score).toFixed(2)}</p>
    <p><b>UUID:</b> {row.uuid}</p>
    {row.host_name && <p><b>Host:</b> {row.host_name} {row.ip && `(${row.ip})`}</p>}
    {row.impact_description && <p style={{marginTop:8}}><b>Impact description:</b><br/>{row.impact_description}</p>}
    {row.context_score_description_md ? (
      <div style={{marginTop:8}}><b>Context:</b>
        <div dangerouslySetInnerHTML={{__html: marked.parse(row.context_score_description_md)}} />
      </div>
    ) : row.context_score_description ? (<p style={{marginTop:8}}><b>Context:</b> {row.context_score_description}</p>) : null}
    <div className="muted" style={{marginTop:8}}>Created: {new Date(row.created_at).toLocaleString?.() || row.created_at}</div>
  </div>
}
