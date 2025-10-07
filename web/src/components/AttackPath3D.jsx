// web/src/components/AttackPath3D.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import ThreatActorPopover from './ThreatActorPopover';
import { getThreatActors } from '../lib/api';

const DEFAULT_BG = '#0b1220';

// Handy: read op_id from URL if present (?op_id=...)
function getOpIdFromUrl() {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get('op_id') || null;
  } catch { return null; }
}

// Given a node, extract hostId + opId with solid fallbacks.
function extractIds(node, fallbackOpId) {
  const hostId =
    node?.host_id ??
    node?.host?.id ??
    node?.id ??
    null;

  const nodeOpId =
    node?.op_id ??
    node?.opId ??
    null;

  const urlOpId = getOpIdFromUrl();

  // Priority: node value > URL > prop fallback
  const opId = nodeOpId || urlOpId || fallbackOpId || null;

  return { hostId, opId };
}

function makeNodeMesh(n) {
  const group = new THREE.Group();
  const r = 5;
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(r, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x4ea1ff, roughness: 0.5, metalness: 0.2 })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.25, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x4ea1ff, transparent: true, opacity: 0.15 })
  );
  group.add(core);
  group.add(halo);
  group.name = `node-${n.id}`;
  return group;
}

export default function AttackPath3D({
  nodes = [],
  links = [],
  // You can still pass opId as a prop; it’s used as a fallback
  opId: propOpId = null,
  backgroundColor = DEFAULT_BG
}) {
  const fgRef = useRef();
  const containerRef = useRef();
  const cameraRef = useRef();

  // { nodeKey, actors, screen:{x,y}, loading }
  const [popover, setPopover] = useState(null);

  // simple in-memory cache to avoid refetching same (opId, hostId)
  const cacheRef = useRef(new Map()); // key: `${opId}::${hostId}` -> {actors, ts}

  const data = useMemo(() => ({ nodes, links }), [nodes, links]);

  function worldToScreen(obj3D) {
    if (!cameraRef.current || !containerRef.current) return null;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const pos = new THREE.Vector3();
    obj3D.getWorldPosition(pos);
    pos.project(cameraRef.current);
    if (pos.z > 1) return null; // behind camera
    return { x: (pos.x * 0.5 + 0.5) * width, y: (-pos.y * 0.5 + 0.5) * height };
  }

  // keep the popover anchored as camera moves
  useEffect(() => {
    let raf;
    const tick = () => {
      if (popover?.nodeKey && fgRef.current) {
        const scene = fgRef.current.graph2Scene?.();
        const obj = scene?.getObjectByName?.(`node-${popover.nodeKey}`);
        if (obj) {
          const screen = worldToScreen(obj);
          if (screen) setPopover(p => (p && p.nodeKey === popover.nodeKey ? { ...p, screen } : p));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [popover?.nodeKey]);

  const handleNodeClick = async (node, evt) => {
    evt?.stopPropagation?.();

    // Get ids from the node (preferred), URL, or prop fallback.
    const { hostId, opId } = extractIds(node, propOpId);

    // Minimal validation
    const nodeKey = node?.id ?? hostId ?? 'unknown';
    if (!hostId) {
      setPopover({
        nodeKey,
        actors: [{ actor: 'Missing host_id on node' }],
        screen: null,
        loading: false
      });
      return;
    }
    if (!opId) {
      setPopover({
        nodeKey,
        actors: [{ actor: 'Missing op_id (node/op_id or URL ?op_id=... or prop)' }],
        screen: null,
        loading: false
      });
      return;
    }

    // Locate the mesh for anchoring
    const scene = fgRef.current?.graph2Scene?.();
    const obj = scene?.getObjectByName?.(`node-${nodeKey}`);
    const screen = obj ? worldToScreen(obj) : null;

    const cacheKey = `${opId}::${hostId}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPopover({ nodeKey, actors: cached.actors, screen, loading: false });
      return;
    }

    // Show loading state
    setPopover({ nodeKey, actors: [], screen, loading: true });

    try {
      const { ok, actors } = await getThreatActors(opId, hostId);
      const finalActors = ok && actors?.length ? actors : [{ actor: 'No Threat Actors found' }];
      cacheRef.current.set(cacheKey, { actors: finalActors, ts: Date.now() });
      setPopover({ nodeKey, actors: finalActors, screen, loading: false });
    } catch (e) {
      console.error(e);
      setPopover({
        nodeKey,
        actors: [{ actor: 'Error loading Threat Actors' }],
        screen,
        loading: false
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ background: backgroundColor }}
      onClick={() => setPopover(null)}
    >
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        nodeThreeObject={makeNodeMesh}
        linkOpacity={0.25}
        linkColor={() => '#7aa2ff'}
        showNavInfo={false}
        backgroundColor={backgroundColor}
        onNodeClick={handleNodeClick}
        onEngineStop={() => {
          // capture camera once the engine settles
          if (fgRef.current?.camera) {
            cameraRef.current = fgRef.current.camera();
          } else if (fgRef.current?.renderer) {
            cameraRef.current = fgRef.current.renderer().camera;
          }
        }}
      />

      {/* Popover */}
      {popover && (
        <ThreatActorPopover
          screenPos={popover.screen}
          actors={
            popover.loading
              ? [{ actor: 'Loading…' }]
              : popover.actors
          }
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
