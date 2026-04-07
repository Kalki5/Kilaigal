import React, { useRef, useState, useEffect } from 'react';
import { useGesture, useDrag } from '@use-gesture/react';
import { useSpring, animated } from '@react-spring/web';
import MemberCard from './MemberCard';
import { memberApi } from '../api';

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

const DraggableMember = ({ member, onMemberClick, onRelationStart, onMove, isDraggingCard }) => {
    const [{ x, y }, api] = useSpring(() => ({ x: member.x, y: member.y }));

    const bind = useDrag(({ offset: [ox, oy], last, event, down }) => {
        if (event.stopPropagation) event.stopPropagation();
        
        isDraggingCard.current = down;
        
        api.start({ x: ox, y: oy, immediate: true });
        if (last) {
            onMove(member.id, ox, oy);
        }
    }, {
        from: () => [x.get(), y.get()],
        filterTaps: true,
        pointer: { capture: false }
    });

    useEffect(() => {
        api.start({ x: member.x, y: member.y });
    }, [member.x, member.y, api]);

    return (
        <animated.div 
            {...bind()}
            style={{ 
                x, y, 
                position: 'absolute',
                touchAction: 'none',
                zIndex: 40 // Higher z-index for cards
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
  const [bb, setBb] = useState(getBoundingBox(members));

  useEffect(() => {
    setBb(getBoundingBox(members));
  }, [members]);

  // Handle centering on a specific member
  useEffect(() => {
    if (centerOnId) {
        const member = members.find(m => m.id === centerOnId);
        if (member && containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            const targetX = -member.x * style.scale.get() + width / 2 - 100 * style.scale.get();
            const targetY = -member.y * style.scale.get() + height / 2 - 75 * style.scale.get();
            api.start({ x: targetX, y: targetY });
        }
    }
  }, [centerOnId, members, api, style.scale]);

  const bindCanvas = useGesture(
    {
      onDrag: ({ offset: [dx, dy], event }) => {
        if (isDraggingCard.current) return;
        
        // Extra check for direct target
        const isCard = event.target.closest('.member-card');
        if (isCard) return;

        api.start({ x: dx, y: dy });
      },
      onPinch: ({ offset: [dScale] }) => {
        if (isDraggingCard.current) return;
        api.start({ scale: Math.max(0.1, Math.min(3, dScale)) });
      },
    },
    {
      drag: { from: () => [style.x.get(), style.y.get()], filterTaps: true },
    }
  );

  return (
    <div 
      ref={containerRef}
      {...bindCanvas()}
      className="w-full h-full touch-none canvas-idle overflow-hidden bg-slate-950 bg-canvas-grid bg-grid-sm sticky"
      onWheel={(e) => {
          if (e.ctrlKey) {
             const newScale = Math.max(0.1, Math.min(3, style.scale.get() - e.deltaY * 0.001));
             api.start({ scale: newScale });
          } else {
              api.start({ x: style.x.get() - e.deltaX, y: style.y.get() - e.deltaY });
          }
      }}
    >
      <animated.div 
        style={{
          transform: style.x.to(() => `translate3d(${style.x.get()}px, ${style.y.get()}px, 0) scale(${style.scale.get()})`),
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
                    <g key={rel.id}>
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
