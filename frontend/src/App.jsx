import React, { useState, useEffect, useCallback } from 'react';
import Canvas from './components/Canvas';
import LoginModal from './components/LoginModal';
import MemberForm from './components/MemberForm';
import RelationModal from './components/RelationModal';
import { memberApi, relationApi, authApi } from './api';
import { Plus, LogOut, User } from 'lucide-react';

function App() {
  const [members, setMembers] = useState([]);
  const [relations, setRelations] = useState([]);
  const [user, setUser] = useState(authApi.getUser());
  const [showLogin, setShowLogin] = useState(!authApi.getUser());
  const [editingMember, setEditingMember] = useState(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [relationSource, setRelationSource] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([
        memberApi.getMembers(),
        relationApi.getRelations()
      ]);
      setMembers(m);
      setRelations(r);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogin = (phone) => {
    authApi.login(phone);
    setUser(phone);
    setShowLogin(false);
  };

  const handleLogout = () => {
    authApi.logout();
    setUser(null);
    setShowLogin(true);
  };

  const handleAddMember = (x = 0, y = 0) => {
    setEditingMember({ x, y });
    setShowMemberForm(true);
  };

  const handleSaveMember = async (data) => {
    try {
      if (editingMember.id) {
        await memberApi.updateMember(editingMember.id, data);
      } else {
        // Find a free grid spot
        const gridX = 250; // width + horizontal padding
        const gridY = 220; // height + vertical padding
        let x = editingMember?.x || 0;
        let y = editingMember?.y || 0;
        
        let found = false;
        let ring = 0;
        const maxRings = 15;
        
        // Circular/Spiral search
        while (!found && ring < maxRings) {
            for (let i = -ring; i <= ring; i++) {
                for (let j = -ring; j <= ring; j++) {
                    // Only check the perimeter of the current ring
                    if (Math.abs(i) !== ring && Math.abs(j) !== ring && ring !== 0) continue;
                    
                    const tx = x + i * gridX;
                    const ty = y + j * gridY;
                    
                    const overlap = members.some(m => 
                        Math.abs(m.x - tx) < gridX * 0.8 && Math.abs(m.y - ty) < gridY * 0.8
                    );
                    
                    if (!overlap) {
                        x = tx;
                        y = ty;
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
            ring++;
        }

        console.log(`Placing new member at: ${x}, ${y} (found in ring ${ring-1})`);
        await memberApi.addMember({ ...data, x, y });
      }
      setShowMemberForm(false);
      setEditingMember(null);
      fetchData();
    } catch (err) {
      console.error('Error saving member', err);
      alert('Error saving member');
    }
  };

  const handleMemberMove = async (id, x, y) => {
    try {
      await memberApi.updateMemberPosition(id, x, y);
      // Update local state smoothly
      setMembers(prev => prev.map(m => m.id === id ? { ...m, x, y } : m));
    } catch (err) {
      console.error('Failed to update position', err);
    }
  };

  const handleMemberClick = (member) => {
    if (relationSource) {
      handleCreateRelation(relationSource, member.id);
    } else {
        if (user) {
            setEditingMember(member);
            setShowMemberForm(true);
        }
    }
  };

  const handleDeleteRelation = async (id) => {
      try {
          await relationApi.deleteRelation(id);
          fetchData();
      } catch (err) {
          alert('Error deleting relation');
      }
  };

  const handleCreateRelation = async (fromId, toId, type = 'Parent') => {
      if (fromId === toId) return;
      try {
          await relationApi.addRelation({ fromId, toId, type });
          setRelationSource(null);
          fetchData();
      } catch (err) {
          alert('Error creating relation');
      }
  };

  const centerOnId = user ? members.find(m => m.phone === user)?.id : null;

  if (loading) return <div className="h-full w-full flex items-center justify-center text-brand-300 font-bold uppercase tracking-widest animate-pulse">Loading Family Tree...</div>;

  return (
    <div className="h-full w-full relative overflow-hidden bg-slate-950">
      {/* Top Bar */}
      <div className="absolute top-6 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
            <div className="p-2 glass rounded-2xl flex items-center gap-2 overflow-hidden border border-white/5">
                <img src="/logo.png" alt="Kilaigal" className="h-10 w-auto" />
                <h1 className="text-xl font-bold bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent mr-2">Kilaigal</h1>
            </div>
            {user && (
                <button 
                  onClick={() => handleAddMember(0, 0)}
                  className="btn-primary flex items-center gap-2"
                >
                    <Plus size={18} />
                    <span>Add Member</span>
                </button>
            )}
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
            {user ? (
                <div className="flex items-center gap-3">
                    <div className="glass px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-slate-300">
                        <User size={16} />
                        <span>{user}</span>
                    </div>
                    <button onClick={handleLogout} className="glass p-2.5 rounded-xl text-slate-400 hover:text-red-400 transition-colors">
                        <LogOut size={20} />
                    </button>
                </div>
            ) : (
                <button onClick={() => setShowLogin(true)} className="btn-primary">Login to Edit</button>
            )}
        </div>
      </div>

      {/* Infinite Canvas */}
      <Canvas 
        members={members} 
        relations={relations} 
        onMemberClick={handleMemberClick}
        onMemberMove={handleMemberMove}
        centerOnId={centerOnId}
        isRelationMode={!!relationSource}
        onRelationStart={(id) => setRelationSource(id)}
        onCancelRelation={() => setRelationSource(null)}
      />

      {/* Modals */}
      {showLogin && <LoginModal onLogin={handleLogin} onCancel={() => setShowLogin(false)} />}
      
      {showMemberForm && (
        <MemberForm 
           member={editingMember} 
           onSave={handleSaveMember} 
           onCancel={() => setShowMemberForm(false)} 
           allMembers={members}
           allRelations={relations}
           onDeleteRelation={handleDeleteRelation}
           onSaveRelation={(rel) => handleCreateRelation(rel.fromId, rel.toId, rel.type)}
        />
      )}
    </div>
  );
}

export default App;
