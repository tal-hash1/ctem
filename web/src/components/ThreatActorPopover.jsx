// web/src/components/ThreatActorPopover.jsx
import React from 'react';

export default function ThreatActorPopover({ screenPos, actors, onClose }) {
  if (!screenPos || !actors?.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: Math.round(screenPos.x) + 12,
        top: Math.round(screenPos.y) + 12,
        maxWidth: 340,
        zIndex: 50,
        pointerEvents: 'auto'
      }}
      className="bg-slate-900/95 text-slate-100 border border-slate-700 rounded-2xl shadow-2xl p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-semibold">Threat Actors</div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200"
          aria-label="Close threat actor popover"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        {actors.slice(0, 5).map((a) => (
          <div key={a.actor + (a.created_at || '')} className="rounded-xl bg-slate-800/80 p-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.actor}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700">{a.severity || 'INFO'}</span>
            </div>
            {a.rule_name && <div className="text-xs text-slate-300 mt-0.5">{a.rule_name}</div>}
            {a.technique && <div className="text-xs text-slate-400 mt-0.5">Technique: {a.technique}</div>}
            {a.created_at && (
              <div className="text-[10px] text-slate-500 mt-1">
                Last seen: {new Date(a.created_at).toLocaleString()}
              </div>
            )}
            {a.description && (
              <div className="text-xs text-slate-300 mt-1 line-clamp-3">{a.description}</div>
            )}
          </div>
        ))}

        {actors.length > 5 && (
          <div className="text-xs text-slate-400">+ {actors.length - 5} more…</div>
        )}
      </div>
    </div>
  );
}
