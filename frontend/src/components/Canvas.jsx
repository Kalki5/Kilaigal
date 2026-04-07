import React, { useRef, useState, useEffect } from 'react';
import { useGesture, useDrag } from '@use-gesture/react';
import { useSpring, animated } from '@react-spring/web';
import MemberCard from './MemberCard';

const getBoundingBox = (members) => {
  if (members.length === 0) return { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  members.forEach(m => {
    minX = Math.min(minX, m.x || 0);
    minY = Math.min(minY, m.y || 0);
    maxX = Math.max(maxX, (m.x || 0) + 200);
    maxY = Math.max(maxY, (m.y || 0) + 150);
  });
  return { 
    minX: minX - 1000, 
    minY: minY - 1000, 
    maxX: maxX + 1000, 
    maxY: maxY + 1000 
  };
};

const DraggableMember = ({ member, onMemberClick, onRelationStart, onMove, isDraggingCard, getScale }) => {
    const [{ x, y }, api] = useSpring(() => ({ x: member.x, y: member.y }));
    const isDraggingLocal = useRef(false);

    const bind = useDrag(({ movement: [mx, my], memo, last, event, active }) => {
        if (event.stopPropagation && event.nativeEvent) {
            event.stopPropagation();
        }
        
        isDraggingCard.current = active;
        isDraggingLocal.current = active;
        
        if (!memo) {
            memo = [x.get(), y.get()];
        }

        const scale = getScale();
        const newX = memo[0] + mx / scale;
        const newY = memo[1] + my / scale;
        
        api.start({ x: newX, y: newY, immediate: active });
        
        if (last) {
            // Add a small delay before releasing canvas lock so canvas doesn't instantly drag on touch end
            setTimeout(() => { if (!isDraggingLocal.current) isDraggingCard.current = false; }, 100);
            onMove(member.id, newX, newY);
        }

        return memo;
    }, {
        filterTaps: true,
        threshold: 5 // Require small movement to start drag, avoiding conflicts with clicks
    });

    useEffect(() => {
        if (!isDraggingLocal.current) {
            api.start({ x: member.x, y: member.y });
        }
    }, [member.x, member.y, api]);

    return (
        <animated.div 
            {...bind()}
            style={{ 
                x, y, 
                position: 'absolute',
                touchAction: 'none',
                zIndex: 40
            }}
            className="cursor-move"
        >
            <MemberCard 
                member={member} 
                onClick={() => onMemberClick(member)}
                onRelationStart={() => onRelationStart(member.id)}
            />
        </animated.div>
    );
};

const Canvas = ({ members, relations, onMemberClick, onRelationStart, isRelationMode, onMemberMove, centerOnId }) => {
  const containerRef = useRef(null);
  const isDraggingCard = useRef(false);
  const [style, api] = useSpring(() => ({ x: 0, y: 0, scale: 1 }));
  
  const prevCenterOnId = useRef();
  const prevMembersLen = useRef(0);

  // Handle centering on a specific member or bounding box
  useEffect(() => {
    const shouldCenter = 
        (centerOnId !== prevCenterOnId.current) ||
        (prevMembersLen.current === 0 && members.length > 0 && !centerOnId);
        
    prevCenterOnId.current = centerOnId;
    prevMembersLen.current = members.length;

    if (shouldCenter && containerRef.current && members.length > 0) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        
        if (centerOnId) {
            const member = members.find(m => m.id === centerOnId);
            if (member) {
                const targetX = -member.x * style.scale.get() + width / 2 - 100 * style.scale.get();
                const targetY = -member.y * style.scale.get() + height / 2 - 75 * style.scale.get();
                api.start({ x: targetX, y: targetY });
            }
        } else {
            const bb = getBoundingBox(members);
            // Center of actual elements without padding
            const centerX = (bb.minX + 1000 + bb.maxX - 1000) / 2;
            const centerY = (bb.minY + 1000 + bb.maxY - 1000) / 2;
            
            const targetX = -centerX * style.scale.get() + width / 2;
            const targetY = -centerY * style.scale.get() + height / 2;
            api.start({ x: targetX, y: targetY });
        }
    }
  }, [centerOnId, members, api, style]);

  const bindCanvas = useGesture(
    {
      onDrag: ({ movement: [mx, my], memo, active }) => {
        if (isDraggingCard.current) return memo;
        
        if (!memo) memo = [style.x.get(), style.y.get()];
        
        api.start({ x: memo[0] + mx, y: memo[1] + my, immediate: active });
        return memo;
      },
      onPinch: ({ offset: [dScale] }) => {
        if (isDraggingCard.current) return;
        api.start({ scale: Math.max(0.1, Math.min(3, dScale)) });
      },
    },
    {
      drag: { filterTaps: true },
    }
  );

  return (
    <div 
      ref={containerRef}
      {...bindCanvas()}
      className="w-full h-full touch-none canvas-idle overflow-hidden bg-slate-950 bg-canvas-grid bg-grid-sm sticky"
      onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
             e.preventDefault();
             const newScale = Math.max(0.1, Math.min(3, style.scale.get() - e.deltaY * 0.01));
             api.start({ scale: newScale });
          } else {
              api.start({ x: style.x.get() - e.deltaX, y: style.y.get() - e.deltaY });
          }
      }}
    >
      <animated.div 
        style={{
          transform: style.x.to((x) => `translate3d(${x}px, ${style.y.get()}px, 0) scale(${style.scale.get()})`),
        }}
        className="relative"
      >
        {/* Relations (SVG Lines) - Move to background layer */}
        <svg className="absolute overflow-visible pointer-events-none z-10" style={{ width: 1, height: 1 }}>
            <defs>
               <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                 <polygon points="0 0, 10 3.5, 0 7" fill="rgba(61,86,240,0.8)" />
               </marker>
            </defs>
            {relations.map(rel => {
                const from = members.find(m => m.id === rel.fromId);
                const to = members.find(m => m.id === rel.toId);
                if (!from || !to) return null;
                
                const x1 = (from.x || 0) + 100;
                const y1 = (from.y || 0) + 75;
                const x2 = (to.x || 0) + 100;
                const y2 = (to.y || 0) + 75;
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;

                return (
                    <g key={rel.id || `${rel.fromId}-${rel.toId}`}>
                        <line 
                          x1={x1} y1={y1}
                          x2={x2} y2={y2}
                          stroke="rgba(61,86,240,0.6)"
                          strokeWidth="3"
                          strokeDasharray="4,4"
                          markerEnd="url(#arrowhead)"
                        />
                        <g transform={`translate(${midX}, ${midY})`}>
                            <rect 
                              x="-35" y="-12" width="70" height="24" rx="12" 
                              fill="#0f172a" stroke="rgba(61,86,240,0.5)" strokeWidth="1.5"
                            />
                            <text 
                              textAnchor="middle" 
                              dominantBaseline="middle" 
                              className="text-[10px] font-extrabold fill-white uppercase tracking-tighter"
                            >
                                {rel.type}
                            </text>
                        </g>
                    </g>
                );
            })}
        </svg>

        {/* Member Cards Layer */}
        <div className="relative z-40">
            {members.map(member => (
            <DraggableMember 
                key={member.id}
                member={member}
                getScale={() => style.scale.get()}
                onMemberClick={onMemberClick}
                onRelationStart={onRelationStart}
                onMove={onMemberMove}
                isDraggingCard={isDraggingCard}
            />
            ))}
        </div>
      </animated.div>
    </div>
  );
};

export default Canvas;
