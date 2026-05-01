import React, { useState, useEffect, useCallback, useRef } from 'react';
import Canvas from './components/Canvas';
import LoginModal from './components/LoginModal';
import MemberForm from './components/MemberForm';
import RelationModal from './components/RelationModal';
import DepthControl from './components/DepthControl';
import SearchBar from './components/SearchBar';
import RelationshipPanel from './components/RelationshipPanel';
import { memberApi, relationApi, authApi } from './api';
import { Plus, LogOut, User, Home, Users } from 'lucide-react';

function App() {
  const [members, setMembers] = useState([]);
  const [relations, setRelations] = useState([]);
  const [user, setUser] = useState(authApi.getUser());
  const [showLogin, setShowLogin] = useState(!authApi.getUser());
  const [editingMember, setEditingMember] = useState(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [relationSource, setRelationSource] = useState(null);
  const [loading, setLoading] = useState(true);

  // New state for depth-based loading and navigation
  const [centerMemberId, setCenterMemberId] = useState(null);
  const [userMemberId, setUserMemberId] = useState(null);
  const [depth, setDepth] = useState(2);
  const [showRelationshipPanel, setShowRelationshipPanel] = useState(false);
  const [highlightedPath, setHighlightedPath] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);

  // Keep full member list for MemberForm relation dropdowns (backward compat)
  const [allMembers, setAllMembers] = useState([]);
  const [allRelations, setAllRelations] = useState([]);

  // Fetch all data — kept for backward compatibility (MemberForm needs full member list)
  const fetchData = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([
        memberApi.getMembers(),
        relationApi.getRelations()
      ]);
      setAllMembers(m);
      setAllRelations(r);
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
  }, []);

  // Load tree centered on a specific member with given depth
  const loadTree = useCallback(async (memberId, treeDepth) => {
    if (!memberId) return;
    setTreeLoading(true);
    try {
      const data = await memberApi.getTree(memberId, treeDepth);
      setMembers(data.members || []);
      setRelations(data.relations || []);
      setCenterMemberId(memberId);
    } catch (err) {
      console.error('Failed to load tree', err);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  // On mount: identify user's member, then load tree centered on them
  useEffect(() => {
    const init = async () => {
      try {
        // Fetch all members to find the user's member record by phone match
        const allMems = await memberApi.getMembers();
        const allRels = await relationApi.getRelations();
        setAllMembers(allMems);
        setAllRelations(allRels);

        if (user) {
          const userMember = allMems.find(m => m.phone === user);
          if (userMember) {
            setUserMemberId(userMember.id);
            // Load tree centered on user's member
            const data = await memberApi.getTree(userMember.id, depth);
            setMembers(data.members || []);
            setRelations(data.relations || []);
            setCenterMemberId(userMember.id);
          } else {
            // User has no member record yet — show all members
            setMembers(allMems);
            setRelations(allRels);
          }
        } else {
          // Not logged in — show all members
          setMembers(allMems);
          setRelations(allRels);
        }
      } catch (err) {
        console.error('Failed to initialize', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle depth change — reload tree with new depth
  const handleDepthChange = useCallback(async (newDepth) => {
    setDepth(newDepth);
    if (centerMemberId) {
      await loadTree(centerMemberId, newDepth);
    }
  }, [centerMemberId, loadTree]);

  // Handle double-click on a member node — reload tree centered on that member
  const handleMemberDoubleClick = useCallback(async (member) => {
    await loadTree(member.id, depth);
  }, [depth, loadTree]);

  // Handle "Back to My Tree" — reload centered on user's member
  const handleBackToMyTree = useCallback(async () => {
    if (userMemberId) {
      await loadTree(userMemberId, depth);
    }
  }, [userMemberId, depth, loadTree]);

  // Handle search result selection — center on selected member and reload tree
  const handleSearchSelect = useCallback(async (member) => {
    await loadTree(member.id, depth);
  }, [depth, loadTree]);

  // Handle path highlighting from RelationshipPanel
  const handleHighlightPath = useCallback((memberIds, relationIds) => {
    setHighlightedPath({ memberIds: memberIds || [], relationIds: relationIds || [] });
  }, []);

  // Clear path highlighting
  const handleClearHighlight = useCallback(() => {
    setHighlightedPath(null);
  }, []);

  const handleLogin = (phone) => {
    authApi.login(phone);
    setUser(phone);
    setShowLogin(false);
    // Re-initialize to find user's member and load their tree
    const initAfterLogin = async () => {
      try {
        const allMems = await memberApi.getMembers();
        const allRels = await relationApi.getRelations();
        setAllMembers(allMems);
        setAllRelations(allRels);
        const userMember = allMems.find(m => m.phone === phone);
        if (userMember) {
          setUserMemberId(userMember.id);
          const data = await memberApi.getTree(userMember.id, depth);
          setMembers(data.members || []);
          setRelations(data.relations || []);
          setCenterMemberId(userMember.id);
        }
      } catch (err) {
        console.error('Failed to load tree after login', err);
      }
    };
    initAfterLogin();
  };

  const handleLogout = () => {
    authApi.logout();
    setUser(null);
    setUserMemberId(null);
    setCenterMemberId(null);
    setShowLogin(true);
    setShowRelationshipPanel(false);
    setHighlightedPath(null);
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
        await memberApi.addMember({ ...data });
      }
      setShowMemberForm(false);
      setEditingMember(null);
      // Refresh both the full list and the tree view
      fetchData();
      if (centerMemberId) {
        loadTree(centerMemberId, depth);
      }
    } catch (err) {
      console.error('Error saving member', err);
      alert('Error saving member');
    }
  };

  // Vis-network handles node positions natively; no need to persist.
  const handleMemberMove = (id, x, y) => {};

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
          if (centerMemberId) {
            loadTree(centerMemberId, depth);
          }
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
          if (centerMemberId) {
            loadTree(centerMemberId, depth);
          }
      } catch (err) {
          alert('Error creating relation');
      }
  };

  const centerOnId = centerMemberId || (user ? members.find(m => m.phone === user)?.id : null);
  const showBackButton = user && userMemberId && centerMemberId && centerMemberId !== userMemberId;

  if (loading) return <div className="h-full w-full flex items-center justify-center text-brand-300 font-bold uppercase tracking-widest animate-pulse">Loading Family Tree...</div>;

  return (
    <div className="h-full w-full relative overflow-hidden bg-slate-950">
      {/* Tree loading overlay */}
      {treeLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="glass px-6 py-3 rounded-2xl flex items-center gap-3 pointer-events-auto">
            <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-300 font-medium">Loading tree...</span>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="absolute top-6 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
            <div className="p-2 glass rounded-2xl flex items-center gap-2 overflow-hidden border border-white/5">
                <img src="/logo.png" alt="Kilaigal" className="h-10 w-auto" />
                <h1 className="text-xl font-bold bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent mr-2">Kilaigal</h1>
            </div>
            {user && (
                <>
                  <button 
                    onClick={() => handleAddMember(0, 0)}
                    className="btn-primary flex items-center gap-2"
                  >
                      <Plus size={18} />
                      <span>Add Member</span>
                  </button>

                  {/* Back to My Tree button — only when viewing another member's tree */}
                  {showBackButton && (
                    <button
                      onClick={handleBackToMyTree}
                      className="glass px-3 py-2 rounded-xl flex items-center gap-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Home size={16} />
                      <span>Back to My Tree</span>
                    </button>
                  )}

                  {/* Find Relationship button */}
                  <button
                    onClick={() => setShowRelationshipPanel(true)}
                    className="glass px-3 py-2 rounded-xl flex items-center gap-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Users size={16} />
                    <span>Find Relationship</span>
                  </button>
                </>
            )}
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
            {user && (
              <>
                {/* Search Bar */}
                <SearchBar onSelectMember={handleSearchSelect} />

                {/* Depth Control */}
                <DepthControl depth={depth} onDepthChange={handleDepthChange} />
              </>
            )}

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
        onMemberDoubleClick={handleMemberDoubleClick}
        onMemberMove={handleMemberMove}
        centerOnId={centerOnId}
        isRelationMode={!!relationSource}
        onRelationStart={(id) => setRelationSource(id)}
        onCancelRelation={() => setRelationSource(null)}
        highlightedMemberIds={highlightedPath?.memberIds || []}
        highlightedRelationIds={highlightedPath?.relationIds || []}
      />

      {/* Relationship Panel */}
      {showRelationshipPanel && (
        <RelationshipPanel
          members={members}
          onHighlightPath={handleHighlightPath}
          onClearHighlight={handleClearHighlight}
          onClose={() => setShowRelationshipPanel(false)}
        />
      )}

      {/* Modals */}
      {showLogin && <LoginModal onLogin={handleLogin} onCancel={() => setShowLogin(false)} />}
      
      {showMemberForm && (
        <MemberForm 
           member={editingMember} 
           onSave={handleSaveMember} 
           onCancel={() => setShowMemberForm(false)} 
           allMembers={allMembers}
           allRelations={allRelations}
           onDeleteRelation={handleDeleteRelation}
           onSaveRelation={(rel) => handleCreateRelation(rel.fromId, rel.toId, rel.type)}
        />
      )}
    </div>
  );
}

export default App;
