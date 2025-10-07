// web/src/components/AttackPath3D.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import ThreatActorPopover from './ThreatActorPopover';
import { getThreatActors } from '../lib/api';

const DEFAULT_OP_ID = '8fccfaf0-c8cd-4688-a8cb-b1c209f1166d';

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

export default function AttackPath3D({ nodes = [], links = [], opId = DEFAULT_OP_ID, backgroundColor = '#0b1220' }) {
  const fgRef = useRef();
  const containerRef = useRef();
  const cameraRef = useRef();
  const [popover, setPopover] = useState(null); // { nodeId, actors, screen:{x,y} }

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
      if (popover?.nodeId && fgRef.current) {
        const scene = fgRef.current.graph2Scene?.();
        const obj = scene?.getObjectByName?.(`node-${popover.nodeId}`);
        if (obj) {
          const screen = worldToScreen(obj);
          if (screen) setPopover(p => (p && p.nodeId === popover.nodeId ? { ...p, screen } : p));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [popover?.nodeId]);

  const handleNodeClick = async (node, evt) => {
    evt?.stopPropagation?.();
    try {
      const nodeId = node?.id ?? node;
      if (!nodeId || !opId) return;

      const scene = fgRef.current?.graph2Scene?.();
      const obj = scene?.getObjectByName?.(`node-${nodeId}`);
      const screen = obj ? worldToScreen(obj) : null;

      const { ok, actors } = await getThreatActors(opId, nodeId);
      setPopover({
        nodeId,
        actors: ok && actors?.length ? actors : [{ actor: 'No Threat Actors found' }],
        screen
      });
    } catch (e) {
      console.error(e);
      setPopover({ nodeId: node?.id, actors: [{ actor: 'Error loading Threat Actors' }], screen: null });
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
          if (fgRef.current?.camera) {
            cameraRef.current = fgRef.current.camera();
          } else if (fgRef.current?.renderer) {
            cameraRef.current = fgRef.current.renderer().camera;
          }
        }}
      />
      {popover?.actors && (
        <ThreatActorPopover
          screenPos={popover.screen}
          actors={popover.actors}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
