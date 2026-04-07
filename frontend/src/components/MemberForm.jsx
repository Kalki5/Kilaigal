import React, { useState, useRef } from 'react';
import { X, Save, AlertCircle, Upload, Image as ImageIcon, Plus } from 'lucide-react';
import { memberApi } from '../api';

const MemberForm = ({ member, onSave, onCancel, allRelations = [], allMembers = [], onDeleteRelation, onSaveRelation }) => {
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('details');
  const [entryMode, setEntryMode] = useState(member?.dob ? 'dob' : 'age');
  const [formData, setFormData] = useState({
    name: member?.name || '',
    dob: member?.dob || '',
    manualAge: member?.manualAge || '',
    location: member?.location || '',
    phone: member?.phone || '',
    photoUrl: member?.photoUrl || '',
    gender: member?.gender || 'Male',
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(member?.photoUrl || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [newRelation, setNewRelation] = useState({ toId: '', type: 'Parent' });
  const [isAddingRel, setIsAddingRel] = useState(false);

  const currentMemberRelations = allRelations.filter(r => 
    r.fromId === member?.id || r.toId === member?.id
  );

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    setUploading(true);
    let photoUrl = formData.photoUrl;

    try {
      if (selectedFile) {
        const uploadRes = await memberApi.uploadPhoto(selectedFile);
        photoUrl = uploadRes.fileUrl;
      }
      
      const payload = { 
        ...formData, 
        photoUrl,
        dob: entryMode === 'dob' ? formData.dob : null,
        manualAge: entryMode === 'age' ? Number(formData.manualAge) : null
      };
      onSave(payload);
    } catch (err) {
      setError('Failed to save member details');
    } finally {
      setUploading(false);
    }
  };

  const handleAddRelation = async () => {
      if (!newRelation.toId) return;
      try {
          onSaveRelation({
              fromId: member.id,
              toId: newRelation.toId,
              type: newRelation.type
          });
          setNewRelation({ toId: '', type: 'Parent' });
          setIsAddingRel(false);
      } catch (err) {
          setError('Failed to add connection');
      }
  };

  const getRelativeName = (rel) => {
      const otherId = rel.fromId === member.id ? rel.toId : rel.fromId;
      const other = allMembers.find(m => m.id === otherId);
      return other ? other.name : 'Unknown';
  };

  const getRelationDisplay = (rel) => {
      const targetName = getRelativeName(rel);
      let type = rel.type;
      
      if (rel.toId === member.id) {
          // Reverse relationship for display phrasing
          const reverseTypes = {
              'Father': 'Son/Daughter',
              'Mother': 'Son/Daughter',
              'Son': 'Father/Mother',
              'Daughter': 'Father/Mother',
              'Spouse': 'Spouse',
              'Sibling': 'Sibling'
          };
          type = reverseTypes[rel.type] || 'Relative';
      }
      
      return (
          <div className="flex flex-col">
              <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-200">{member.name}</span>
                  <span className="text-slate-400">is</span>
                  <span className="px-2 py-0.5 bg-brand-500/20 text-brand-300 rounded text-[10px] font-bold border border-brand-500/20 uppercase tracking-tight">
                    {type}
                  </span>
                  <span className="text-slate-400">of</span>
                  <span className="font-bold text-slate-200">{targetName}</span>
              </div>
          </div>
      );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-panel max-w-lg">
        {/* Header & Tabs */}
        <div className="p-1 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between px-5 py-4">
                <h2 className="text-lg font-extrabold text-slate-200 tracking-tight">
                    {member?.id ? 'Member Profile' : 'Add New Member'}
                </h2>
                <button onClick={onCancel} className="p-2 hover:bg-white/5 rounded-full transition-all">
                    <X size={20} className="text-slate-400" />
                </button>
            </div>
            
            {member?.id && (
                <div className="flex px-5 gap-8">
                    <button 
                        onClick={() => setActiveTab('details')}
                        className={`pb-3 text-xs font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === 'details' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                    >Details</button>
                    <button 
                        onClick={() => setActiveTab('relations')}
                        className={`pb-3 text-xs font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === 'relations' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                    >
                        Relations 
                        <span className="ml-2 px-2 py-0.5 bg-white/5 rounded-full text-[10px] font-bold">{currentMemberRelations.length}</span>
                    </button>
                </div>
            )}
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
            {activeTab === 'details' ? (
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    {/* Photo Upload Area */}
                    <div className="flex flex-col items-center gap-4">
                        <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative w-32 h-32 rounded-[2rem] overflow-hidden border-2 border-dashed border-white/10 hover:border-brand-500/50 cursor-pointer group transition-all duration-300 ${formData.gender === 'Female' ? 'hover:border-pink-500/50 shadow-pink-500/10' : 'shadow-brand-500/10'} shadow-xl`}
                        >
                        {previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-white/5 flex flex-col items-center justify-center text-slate-500 group-hover:text-brand-300">
                            <Upload size={32} strokeWidth={1.5} />
                            <span className="text-[10px] mt-3 font-black uppercase tracking-widest">Update Photo</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <ImageIcon size={32} className="text-white" />
                        </div>
                        </div>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div className="col-span-2 space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Full Name</label>
                            <input 
                            className="input-field text-lg font-bold"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Full Name"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Gender</label>
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                                <button type="button" onClick={() => setFormData({ ...formData, gender: 'Male' })} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${formData.gender === 'Male' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-300'}`}>Male</button>
                                <button type="button" onClick={() => setFormData({ ...formData, gender: 'Female' })} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${formData.gender === 'Female' ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20' : 'text-slate-500 hover:text-slate-300'}`}>Female</button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Entry Mode</label>
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                                <button type="button" onClick={() => setEntryMode('dob')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${entryMode === 'dob' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-300'}`}>DOB</button>
                                <button type="button" onClick={() => setEntryMode('age')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${entryMode === 'age' ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-300'}`}>Age</button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{entryMode === 'dob' ? 'Born' : 'Years Old'}</label>
                            {entryMode === 'dob' ? (
                                <input type="date" className="input-field [color-scheme:dark]" value={formData.dob || ''} onChange={e => setFormData({ ...formData, dob: e.target.value })} />
                            ) : (
                                <input type="number" className="input-field" value={formData.manualAge || ''} onChange={e => setFormData({ ...formData, manualAge: e.target.value })} />
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Location</label>
                            <input className="input-field" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="City" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Phone Contact</label>
                        <input className="input-field font-mono" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
                    </div>

                    {error && (activeTab === 'details') && (
                        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-300 animate-in fade-in slide-in-from-top-1">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-4 pt-4 sticky bottom-0 bg-slate-900/50 backdrop-blur-md pb-2">
                        <button type="button" onClick={onCancel} className="btn-ghost flex-1">Discard</button>
                        <button type="submit" disabled={uploading} className="btn-primary flex-1 flex items-center justify-center gap-2 group">
                            <Save size={18} className="group-hover:scale-110 transition-transform" />
                            <span className="font-bold">{uploading ? 'Synching...' : 'Save Member'}</span>
                        </button>
                    </div>
                </form>
            ) : (
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Active Network</h3>
                        {!isAddingRel && (
                            <button 
                                onClick={() => setIsAddingRel(true)}
                                className="text-[10px] font-black uppercase tracking-widest text-brand-400 hover:text-brand-300 flex items-center gap-1.5 transition-colors"
                            >
                                <Plus size={14} /> Add Connection
                            </button>
                        )}
                    </div>

                    {isAddingRel && (
                        <div className="glass p-5 rounded-2xl border border-brand-500/20 bg-brand-500/[0.02] flex flex-col gap-4 animate-in zoom-in-95 duration-200">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Target Member</label>
                                    <select 
                                        className="input-field text-xs h-10"
                                        value={newRelation.toId}
                                        onChange={e => setNewRelation({ ...newRelation, toId: e.target.value })}
                                    >
                                        <option value="">Select Person...</option>
                                        {allMembers.filter(m => m.id !== member.id).map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Relation Type</label>
                                    <select 
                                        className="input-field text-xs h-10"
                                        value={newRelation.type}
                                        onChange={e => setNewRelation({ ...newRelation, type: e.target.value })}
                                    >
                                        <option value="Parent">Parent</option>
                                        <option value="Child">Child</option>
                                        <option value="Spouse">Spouse</option>
                                        <option value="Sibling">Sibling</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-2">
                                <button onClick={() => setIsAddingRel(false)} className="btn-ghost flex-1 py-2 text-[10px] font-bold">Cancel</button>
                                <button onClick={handleAddRelation} className="btn-primary flex-1 py-2 text-[10px] font-bold">Establish Link</button>
                            </div>
                        </div>
                    )}

                    {currentMemberRelations.length === 0 ? (
                        <div className="py-16 border border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-slate-500/50 text-center">
                             <div className="p-4 rounded-full bg-white/[0.02] mb-4">
                                <ImageIcon size={32} strokeWidth={1} className="opacity-20" />
                             </div>
                             <p className="text-sm font-medium">No connections established yet.</p>
                             <p className="text-[10px] mt-1 font-bold uppercase tracking-widest">Add your first relation above</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {currentMemberRelations.map(rel => (
                                <div key={rel.id} className="glass border border-white/[0.03] hover:border-brand-500/20 p-4 rounded-2xl flex items-center justify-between group transition-all duration-300">
                                    {getRelationDisplay(rel)}
                                    <button 
                                        onClick={() => onDeleteRelation(rel.id || (rel.SK ? rel.SK.replace('REL#', '') : undefined))}
                                        className="p-2.5 hover:bg-red-500/10 rounded-xl text-slate-600 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                                        title="Delete connection"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 p-5 rounded-3xl bg-white/[0.02] border border-white/[0.03] space-y-2">
                        <div className="flex items-center gap-2 text-brand-400">
                            <AlertCircle size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Network Logic</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                            Relationships are bi-directional. Adding a <span className="text-white font-bold">Parent</span> link will automatically represent this member as their <span className="text-white font-bold">Child</span> on their profile.
                        </p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default MemberForm;
