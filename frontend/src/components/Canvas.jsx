import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { Network } from 'vis-network/standalone';
import { DataSet } from 'vis-data/standalone';

// ── Helpers ──────────────────────────────────────────────

const calculateAge = (m) => {
  if (m.dob) {
    const birthDate = new Date(m.dob);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const month = today.getMonth() - birthDate.getMonth();
    if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  }
  if (m.manualAge) {
    const updateDate = new Date(m.updatedAt || m.createdAt || new Date());
    const yearsElapsed = new Date().getFullYear() - updateDate.getFullYear();
    return Number(m.manualAge) + yearsElapsed;
  }
  return null;
};

// Build a multi-line label that shows the same info as MemberCard
const buildLabel = (member) => {
  const age = calculateAge(member);
  let label = member.name || '?';
  if (age !== null) label += `  (${age})`;
  if (member.location) label += `\n📍 ${member.location}`;
  return label;
};

// Gender-based border/color map
const genderStyle = (gender) => {
  switch (gender) {
    case 'Female':
      return { borderColor: '#ec4899', hoverBorder: '#f472b6', highlightBorder: '#f9a8d4' };
    case 'Male':
      return { borderColor: '#3d56f0', hoverBorder: '#617dff', highlightBorder: '#8faaff' };
    default:
      return { borderColor: '#64748b', hoverBorder: '#94a3b8', highlightBorder: '#cbd5e1' };
  }
};

// Compute the hierarchy level for a member based on relations and ages
const computeLevels = (members, relations) => {
  const levels = {};
  const childOf = {};   // memberId -> [parentIds]
  const parentOf = {};  // memberId -> [childIds]

  // Build adjacency from explicit Parent / Child relations
  relations.forEach(rel => {
    if (rel.type === 'Parent') {
      // fromId IS PARENT OF toId
      if (!parentOf[rel.fromId]) parentOf[rel.fromId] = [];
      parentOf[rel.fromId].push(rel.toId);
      if (!childOf[rel.toId]) childOf[rel.toId] = [];
      childOf[rel.toId].push(rel.fromId);
    } else if (rel.type === 'Child') {
      // fromId IS CHILD OF toId  =>  toId is parent
      if (!parentOf[rel.toId]) parentOf[rel.toId] = [];
      parentOf[rel.toId].push(rel.fromId);
      if (!childOf[rel.fromId]) childOf[rel.fromId] = [];
      childOf[rel.fromId].push(rel.toId);
    }
  });

  // Find roots (members with no parents)
  const roots = members.filter(m => !(childOf[m.id] && childOf[m.id].length > 0));
  
  // BFS from roots to assign levels
  const queue = [];
  roots.forEach(r => {
    levels[r.id] = 0;
    queue.push(r.id);
  });

  while (queue.length > 0) {
    const current = queue.shift();
    const children = parentOf[current] || [];
    children.forEach(childId => {
      if (levels[childId] === undefined) {
        levels[childId] = (levels[current] || 0) + 1;
        queue.push(childId);
      }
    });
  }

  // Any unvisited members (disconnected) get level based on age or fallback
  members.forEach(m => {
    if (levels[m.id] === undefined) {
      const age = calculateAge(m);
      // Older people get lower level numbers (higher in the tree)
      levels[m.id] = age !== null ? Math.max(0, 4 - Math.floor(age / 25)) : 2;
    }
  });

  // Spouses should share the same level as their partner
  relations.forEach(rel => {
    if (rel.type === 'Spouse') {
      const levelA = levels[rel.fromId];
      const levelB = levels[rel.toId];
      if (levelA !== undefined && levelB !== undefined) {
        const minLevel = Math.min(levelA, levelB);
        levels[rel.fromId] = minLevel;
        levels[rel.toId] = minLevel;
      }
    }
  });

  return levels;
};

// Generate an SVG data-URI for the avatar initial (used when no photo)
const generateInitialAvatar = (name, gender) => {
  const initial = (name || '?')[0].toUpperCase();
  const bgColor = gender === 'Female' ? '#4a1942' : gender === 'Male' ? '#1a2356' : '#334155';
  const textColor = gender === 'Female' ? '#f9a8d4' : gender === 'Male' ? '#8faaff' : '#cbd5e1';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="50" fill="${bgColor}"/>
      <text x="50" y="55" text-anchor="middle" dominant-baseline="middle" 
            font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="42" fill="${textColor}">
        ${initial}
      </text>
    </svg>
  `.trim();
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};


// ── Component ────────────────────────────────────────────

const Canvas = ({ members, relations, onMemberClick, onMemberDoubleClick, onRelationStart, isRelationMode, onMemberMove, centerOnId, highlightedMemberIds = [], highlightedRelationIds = [] }) => {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const nodesDatasetRef = useRef(null);
  const edgesDatasetRef = useRef(null);

  // Stable callback refs so vis event handlers always see the latest functions
  const onMemberClickRef = useRef(onMemberClick);
  const onMemberDoubleClickRef = useRef(onMemberDoubleClick);
  const onMemberMoveRef = useRef(onMemberMove);
  const membersRef = useRef(members);

  useEffect(() => { onMemberClickRef.current = onMemberClick; }, [onMemberClick]);
  useEffect(() => { onMemberDoubleClickRef.current = onMemberDoubleClick; }, [onMemberDoubleClick]);
  useEffect(() => { onMemberMoveRef.current = onMemberMove; }, [onMemberMove]);
  useEffect(() => { membersRef.current = members; }, [members]);

  // ── Initialize vis-network once ──
  useEffect(() => {
    if (!containerRef.current) return;

    const nodesDataset = new DataSet();
    const edgesDataset = new DataSet();
    nodesDatasetRef.current = nodesDataset;
    edgesDatasetRef.current = edgesDataset;

    const options = {
      autoResize: true,
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'UD',           // Up → Down  (parents at top)
          sortMethod: 'directed',    // Follow edge direction
          levelSeparation: 200,
          nodeSpacing: 180,
          treeSpacing: 220,
          blockShifting: true,
          edgeMinimization: true,
          parentCentralization: true,
          shakeTowards: 'roots'
        }
      },
      physics: {
        enabled: false
      },
      interaction: {
        hover: true,
        dragNodes: true,
        dragView: true,
        zoomView: true,
        tooltipDelay: 200,
        multiselect: false,
        navigationButtons: false,
        keyboard: false
      },
      nodes: {
        shape: 'circularImage',
        size: 36,
        borderWidth: 3,
        borderWidthSelected: 4,
        color: {
          border: '#3d56f0',
          background: '#0f172a',
          highlight: { border: '#8faaff', background: '#1e293b' },
          hover: { border: '#617dff', background: '#1e293b' }
        },
        font: {
          color: '#e2e8f0',
          size: 13,
          face: 'Inter, system-ui, sans-serif',
          multi: 'md',
          bold: {
            color: '#ffffff',
            size: 14,
            face: 'Inter, system-ui, sans-serif',
            mod: 'bold'
          }
        },
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.4)',
          size: 12,
          x: 0,
          y: 4
        },
        imagePadding: 4
      },
      edges: {
        smooth: {
          enabled: true,
          type: 'cubicBezier',
          forceDirection: 'vertical',
          roundness: 0.4
        },
        color: {
          color: 'rgba(61,86,240,0.45)',
          highlight: 'rgba(61,86,240,1)',
          hover: 'rgba(61,86,240,0.7)',
          inherit: false
        },
        width: 2,
        hoverWidth: 0.5,
        selectionWidth: 1,
        dashes: false,
        arrows: {
          to: { enabled: true, scaleFactor: 0.5, type: 'arrow' }
        },
        font: {
          color: '#cbd5e1',
          size: 10,
          face: 'Inter, system-ui, sans-serif',
          background: '#0f172a',
          strokeWidth: 0,
          align: 'horizontal'
        }
      }
    };

    const network = new Network(containerRef.current, { nodes: nodesDataset, edges: edgesDataset }, options);
    networkRef.current = network;

    // ── Events ──

    // Click a node → open member detail / relation mode
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const id = params.nodes[0];
        const member = membersRef.current.find(m => m.id === id);
        if (member && onMemberClickRef.current) {
          onMemberClickRef.current(member);
        }
      }
    });

    // After the user drags a node, persist the new position
    network.on('dragEnd', (params) => {
      if (params.nodes.length > 0 && onMemberMoveRef.current) {
        const id = params.nodes[0];
        const pos = network.getPositions([id]);
        if (pos[id]) {
          onMemberMoveRef.current(id, pos[id].x, pos[id].y);
        }
      }
    });

    // Double-click a node → reload tree centered on that member
    network.on('doubleClick', (params) => {
      if (params.nodes.length > 0) {
        const id = params.nodes[0];
        const member = membersRef.current.find(m => m.id === id);
        if (member && onMemberDoubleClickRef.current) {
          onMemberDoubleClickRef.current(member);
        }
      }
    });

    return () => {
      network.destroy();
      networkRef.current = null;
    };
  }, []);

  // ── Sync members + relations into datasets ──
  useEffect(() => {
    const nodesDS = nodesDatasetRef.current;
    const edgesDS = edgesDatasetRef.current;
    const network = networkRef.current;
    if (!nodesDS || !edgesDS || !network) return;

    const levels = computeLevels(members, relations);

    // Build vis nodes
    const newNodes = members.map(m => {
      const gs = genderStyle(m.gender);
      const image = m.photoUrl || generateInitialAvatar(m.name, m.gender);
      return {
        id: m.id,
        label: buildLabel(m),
        image: image,
        brokenImage: generateInitialAvatar(m.name, m.gender),
        shape: 'circularImage',
        level: levels[m.id] ?? 2,
        size: 36,
        borderWidth: 3,
        color: {
          border: gs.borderColor,
          background: '#0f172a',
          highlight: { border: gs.highlightBorder, background: '#1e293b' },
          hover: { border: gs.hoverBorder, background: '#1e293b' }
        }
      };
    });

    // Build vis edges
    const newEdges = relations.map(rel => {
      let from = rel.fromId;
      let to = rel.toId;

      // For hierarchy, Parent edges go parent→child (downward)
      if (rel.type === 'Child') {
        from = rel.toId;
        to = rel.fromId;
      }

      const edgeLabel = (rel.type || '').toUpperCase();
      const isSpouse = rel.type === 'Spouse';
      const isSibling = rel.type === 'Sibling';

      return {
        id: rel.id || `${rel.fromId}-${rel.toId}`,
        from,
        to,
        label: edgeLabel,
        arrows: (isSpouse || isSibling) ? { to: { enabled: false } } : undefined,
        dashes: isSpouse ? [6, 4] : isSibling ? [3, 3] : false,
        color: {
          color: isSpouse ? 'rgba(236,72,153,0.5)' : isSibling ? 'rgba(100,116,139,0.5)' : 'rgba(61,86,240,0.45)',
          highlight: isSpouse ? '#ec4899' : isSibling ? '#94a3b8' : '#3d56f0',
          hover: isSpouse ? 'rgba(236,72,153,0.7)' : isSibling ? 'rgba(100,116,139,0.7)' : 'rgba(61,86,240,0.7)',
          inherit: false
        },
        smooth: (isSpouse || isSibling) ? {
          enabled: true,
          type: 'curvedCW',
          roundness: 0.2
        } : undefined
      };
    });

    // Diff update: clear and repopulate (DataSet handles diffing internally)
    nodesDS.clear();
    edgesDS.clear();
    nodesDS.add(newNodes);
    edgesDS.add(newEdges);

    // After data is set, fit the view nicely
    setTimeout(() => {
      network.fit({
        animation: { duration: 400, easingFunction: 'easeInOutQuad' }
      });
    }, 100);

  }, [members, relations]);

  // ── Focus on a specific member ──
  useEffect(() => {
    const network = networkRef.current;
    if (!network || members.length === 0) return;

    if (centerOnId) {
      // Small delay to let the hierarchical layout settle
      setTimeout(() => {
        network.focus(centerOnId, {
          scale: 1.2,
          animation: { duration: 600, easingFunction: 'easeInOutQuad' }
        });
        network.selectNodes([centerOnId]);
      }, 200);
    }
  }, [centerOnId, members.length]);

  // ── Apply / remove path highlighting ──
  useEffect(() => {
    const nodesDS = nodesDatasetRef.current;
    const edgesDS = edgesDatasetRef.current;
    if (!nodesDS || !edgesDS) return;

    const highlightedMemberSet = new Set(highlightedMemberIds);
    const highlightedRelationSet = new Set(highlightedRelationIds);
    const hasHighlights = highlightedMemberIds.length > 0 || highlightedRelationIds.length > 0;

    // Update nodes: apply gold border for highlighted members, reset others to gender-based colors
    const nodeUpdates = [];
    members.forEach(m => {
      const gs = genderStyle(m.gender);
      if (hasHighlights && highlightedMemberSet.has(m.id)) {
        nodeUpdates.push({
          id: m.id,
          borderWidth: 4,
          color: {
            border: '#f59e0b',
            background: '#0f172a',
            highlight: { border: '#fbbf24', background: '#1e293b' },
            hover: { border: '#fbbf24', background: '#1e293b' }
          }
        });
      } else {
        nodeUpdates.push({
          id: m.id,
          borderWidth: 3,
          color: {
            border: gs.borderColor,
            background: '#0f172a',
            highlight: { border: gs.highlightBorder, background: '#1e293b' },
            hover: { border: gs.hoverBorder, background: '#1e293b' }
          }
        });
      }
    });
    if (nodeUpdates.length > 0) {
      nodesDS.update(nodeUpdates);
    }

    // Update edges: apply gold color for highlighted relations, reset others to type-based colors
    const edgeUpdates = [];
    relations.forEach(rel => {
      const edgeId = rel.id || `${rel.fromId}-${rel.toId}`;
      const isSpouse = rel.type === 'Spouse';
      const isSibling = rel.type === 'Sibling';

      if (hasHighlights && highlightedRelationSet.has(rel.id)) {
        edgeUpdates.push({
          id: edgeId,
          width: 3,
          color: {
            color: 'rgba(245,158,11,0.7)',
            highlight: '#f59e0b',
            hover: 'rgba(245,158,11,0.9)',
            inherit: false
          }
        });
      } else {
        edgeUpdates.push({
          id: edgeId,
          width: 2,
          color: {
            color: isSpouse ? 'rgba(236,72,153,0.5)' : isSibling ? 'rgba(100,116,139,0.5)' : 'rgba(61,86,240,0.45)',
            highlight: isSpouse ? '#ec4899' : isSibling ? '#94a3b8' : '#3d56f0',
            hover: isSpouse ? 'rgba(236,72,153,0.7)' : isSibling ? 'rgba(100,116,139,0.7)' : 'rgba(61,86,240,0.7)',
            inherit: false
          }
        });
      }
    });
    if (edgeUpdates.length > 0) {
      edgesDS.update(edgeUpdates);
    }
  }, [highlightedMemberIds, highlightedRelationIds, members, relations]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ background: '#0c0e1a' }}
      />
    </div>
  );
};

export default Canvas;
