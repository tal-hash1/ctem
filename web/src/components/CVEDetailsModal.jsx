import React from 'react';

export default function CVEDetailsModal({ open, onClose, data }) {
  if (!open) return null;
  const summary = data?.summary;
  const occurrences = data?.occurrences || [];

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              CVE Details: {summary?.cve || 'Unknown'}
            </div>
            <div style={{ opacity: .75, fontSize: 12 }}>
              Occurrences in this operation: {summary?.occurrence_count ?? 0}
            </div>
          </div>
          <button style={styles.x} onClick={onClose}>✕</button>
        </div>

        {occurrences.length === 0 ? (
          <div className="muted">No occurrences found in these attack paths.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12, maxHeight: '60vh', overflow: 'auto' }}>
            {occurrences.map(o => (
              <div key={o.uuid} className="card" style={{ border: '1px solid #1f2937', padding: 12, borderRadius: 12 }}>
                <div><b>Path:</b> {o.title || '—'}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{o.uuid}</div>
                {o.severity && <div style={{ marginTop: 6 }}><b>Severity:</b> {o.severity} {typeof o.score === 'number' ? `(score ${o.score})` : ''}</div>}
                {o.impact_title && <div style={{ marginTop: 6 }}><b>Impact:</b> {o.impact_title}</div>}
                {o.hosts && <div style={{ marginTop: 6 }}><b>Hosts:</b> {String(o.hosts)}</div>}
                {o.impact_description && (
                  <div style={{ marginTop: 8 }}>
                    <b>Impact description:</b>
                    <div style={{ marginTop: 4 }}>{o.impact_description}</div>
                  </div>
                )}
                {o.context_score_description && (
                  <div style={{ marginTop: 8 }}>
                    <b>Context:</b>
                    <div style={{ marginTop: 4 }}>{o.context_score_description}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  backdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'grid', placeItems:'center', zIndex:1000, padding:16 },
  modal: { width:'min(880px, 96vw)', background:'#0f1720', border:'1px solid #1f2937', borderRadius:16, padding:16, boxShadow:'0 10px 40px rgba(0,0,0,.5)' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  x: { background:'transparent', color:'#e5e7eb', border:'1px solid #374151', borderRadius:8, padding:'4px 8px', cursor:'pointer' }
};
