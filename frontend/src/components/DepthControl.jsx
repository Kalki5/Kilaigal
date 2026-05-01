import React from 'react';
import { Layers } from 'lucide-react';

const DepthControl = ({ depth, onDepthChange }) => {
  return (
    <div className="glass px-3 py-2 rounded-xl flex items-center gap-2.5 text-sm">
      <Layers size={16} className="text-brand-400 shrink-0" />
      <span className="text-slate-400 whitespace-nowrap">Depth</span>
      <input
        type="range"
        min="1"
        max="5"
        value={depth}
        onChange={(e) => onDepthChange(Number(e.target.value))}
        className="w-20 h-1.5 accent-brand-500 cursor-pointer"
      />
      <span className="text-white font-semibold min-w-[1ch] text-center">{depth}</span>
    </div>
  );
};

export default DepthControl;
