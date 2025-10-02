import React from 'react';

const SWATCH = (c) => ({
  width: 14,
  height: 14,
  borderRadius: 999,
  background: c,
  display: 'inline-block',
  marginRight: 8,
  border: '1px solid rgba(255,255,255,.2)'
});

export default function GraphLegend({ style }) {
  return (
    <div
      className="card"
      style={{
        position: 'absolute',
        right: 12,
        top: 12,
        zIndex: 900,
        padding: 10,
        lineHeight: 1.4,
        maxWidth: 260,
        ...style
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Legend</div>

      {/* Crown Jewels */}
      <div style={{ display: 'grid', rowGap: 6 }}>
        <div><span style={SWATCH('#facc15')}/> Crown Jewel (reachable)</div>
        <div><span style={SWATCH('#fde68a')}/> Crown Jewel (isolated)</div>
      </div>

      <div style={{ height: 8 }} />

      {/* Severity colors (match your SEV_COLOR map) */}
      <div style={{ display: 'grid', rowGap: 6 }}>
        <div><span style={SWATCH('#ef4444')}/> Critical node</div>
        <div><span style={SWATCH('#f59e0b')}/> High</div>
        <div><span style={SWATCH('#60a5fa')}/> Medium</div>
        <div><span style={SWATCH('#34d399')}/> Low</div>
        <div><span style={SWATCH('#94a3b8')}/> Info / Other</div>
      </div>

      <div style={{ height: 8 }} />

      {/* States / effects */}
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        <div>• Dimmed nodes: not currently reachable</div>
        <div>• Red links: disrupted by simulation</div>
        <div>• Glow/halo: emphasis (e.g., crown jewels)</div>
        <div>• Click a node to open CVE details</div>
      </div>
    </div>
  );
}
