import React, { useState, useMemo } from 'react';
import { Search, X, User } from 'lucide-react';

const RelationModal = ({ members, currentMember, onSelect, onCancel }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [relationshipType, setRelationshipType] = useState('Parent');

    const filteredMembers = useMemo(() => {
        return members.filter(m => 
            m.id !== currentMember.id && 
            m.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [members, currentMember, searchTerm]);

    const relationshipTypes = [
        { id: 'Parent', label: 'Parent' },
        { id: 'Father', label: 'Father' },
        { id: 'Mother', label: 'Mother' },
        { id: 'Child', label: 'Child' },
        { id: 'Son', label: 'Son' },
        { id: 'Daughter', label: 'Daughter' },
        { id: 'Spouse', label: 'Spouse' },
        { id: 'Sibling', label: 'Sibling' },
        { id: 'Brother', label: 'Brother' },
        { id: 'Sister', label: 'Sister' },
    ];

    return (
        <div className="modal-overlay">
            <div className="modal-panel max-w-sm">
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <div className="flex flex-col">
                        <h2 className="text-lg font-bold text-slate-200">New Connection</h2>
                        <p className="text-[10px] text-brand-400 uppercase tracking-widest font-bold">
                            {currentMember.name} is the ...
                        </p>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-white/5 rounded-full">
                        <X size={18} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-5 border-b border-white/5 bg-white/2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Relationship Type</label>
                    <div className="grid grid-cols-2 gap-2">
                        {relationshipTypes.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setRelationshipType(t.id)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                                    relationshipType === t.id 
                                    ? 'bg-brand-500/20 border-brand-500 text-brand-300' 
                                    : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-4">
                    <div className="relative mb-4">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input 
                          className="input-field pl-10"
                          placeholder="Search for relative..."
                          value={searchTerm}
                          onChange={e => setSearchTerm(e.target.value)}
                          autoFocus
                        />
                    </div>

                    <div className="max-h-[250px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {filteredMembers.length > 0 ? filteredMembers.map(m => (
                            <button 
                              key={m.id}
                              onClick={() => onSelect(m.id, relationshipType)}
                              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-left transition-colors group"
                            >
                                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 shrink-0">
                                    {m.photoUrl ? (
                                        <img src={m.photoUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-brand-900/40 flex items-center justify-center text-[10px] font-bold text-brand-300">
                                            {m.name[0]}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-medium text-slate-200 group-hover:text-brand-300 transition-colors">{m.name}</h4>
                                    <p className="text-[10px] text-slate-500">
                                        Click to set as {currentMember.name}'s {relationshipType}
                                    </p>
                                </div>
                            </button>
                        )) : (
                            <div className="p-10 text-center text-slate-600 space-y-2">
                                <User size={24} className="mx-auto opacity-20" />
                                <p className="text-xs italic">No members found</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-white/2 border-t border-white/5">
                    <button onClick={onCancel} className="btn-ghost w-full">Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default RelationModal;
