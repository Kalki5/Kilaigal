import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ArrowRight, Loader2, Search, Users } from 'lucide-react';
import { aiApi } from '../api';

const MemberSelect = ({ label, members, selectedId, onSelect, excludeId }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedMember = members.find(m => m.id === selectedId);

  const filtered = members.filter(m => {
    if (m.id === excludeId) return false;
    if (!query.trim()) return true;
    return m.name.toLowerCase().includes(query.toLowerCase());
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((member) => {
    onSelect(member.id);
    setQuery('');
    setIsOpen(false);
  }, [onSelect]);

  const handleClear = useCallback(() => {
    onSelect(null);
    setQuery('');
  }, [onSelect]);

  return (
    <div ref={containerRef} className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
        {label}
      </label>
      {selectedMember ? (
        <div className="flex items-center gap-2 input-field">
          <span className="text-sm text-slate-200 font-medium truncate flex-1">
            {selectedMember.name}
          </span>
          <button
            onClick={handleClear}
            className="p-0.5 hover:bg-white/10 rounded transition-colors shrink-0"
          >
            <X size={14} className="text-slate-400" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="input-field flex items-center gap-2">
            <Search size={14} className="text-slate-500 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Search member..."
              className="bg-transparent border-none outline-none text-white placeholder-slate-500 text-sm w-full"
            />
          </div>
          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl overflow-hidden shadow-2xl shadow-black/60 z-50 max-h-[200px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500 text-center">
                  No members found
                </div>
              ) : (
                filtered.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => handleSelect(member)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"
                  >
                    <span className="text-sm text-slate-200 font-medium truncate">
                      {member.name}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const RelationshipPanel = ({ members, onHighlightPath, onClearHighlight, onClose }) => {
  const [fromMemberId, setFromMemberId] = useState(null);
  const [toMemberId, setToMemberId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const countdownRef = useRef(null);

  // Cleanup countdown timer on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Countdown timer for rate limit
  useEffect(() => {
    if (rateLimitCountdown <= 0) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      setRateLimitCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [rateLimitCountdown]);

  const handleClose = useCallback(() => {
    onClearHighlight();
    onClose();
  }, [onClearHighlight, onClose]);

  const handleFindPath = useCallback(async () => {
    if (!fromMemberId || !toMemberId) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setRateLimitCountdown(0);

    try {
      const data = await aiApi.findRelationship(fromMemberId, toMemberId);
      setResult(data);

      // Highlight path on canvas if path exists
      if (data.path && data.path.length > 0) {
        const memberIds = data.path.map(step => step.memberId);
        onHighlightPath(memberIds, []);
      }
    } catch (err) {
      if (err.response && err.response.status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'], 10) || 60;
        setRateLimitCountdown(retryAfter);
        setError('rate_limit');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [fromMemberId, toMemberId, onHighlightPath]);

  const canFindPath = fromMemberId && toMemberId && !loading && rateLimitCountdown === 0;

  const getStepMemberName = (step) => {
    const member = members.find(m => m.id === step.memberId);
    return member ? member.name : step.memberName || 'Unknown';
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={handleClose} />

      {/* Panel */}
      <div className="relative ml-auto w-[400px] h-full glass-heavy border-l border-white/10 shadow-2xl shadow-black/60 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-brand-400" />
            <h2 className="text-base font-extrabold text-slate-200 tracking-tight">
              Find Relationship
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/5 rounded-full transition-all"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Member Selection */}
          <MemberSelect
            label="Person A"
            members={members}
            selectedId={fromMemberId}
            onSelect={setFromMemberId}
            excludeId={toMemberId}
          />

          <MemberSelect
            label="Person B"
            members={members}
            selectedId={toMemberId}
            onSelect={setToMemberId}
            excludeId={fromMemberId}
          />

          {/* Find Path Button */}
          <button
            onClick={handleFindPath}
            disabled={!canFindPath}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span className="font-bold">Finding path...</span>
              </>
            ) : (
              <span className="font-bold">Find Path</span>
            )}
          </button>

          {/* Rate Limit Error */}
          {error === 'rate_limit' && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-sm text-amber-300 space-y-1">
              <p className="font-bold">Too many requests</p>
              <p className="text-xs text-amber-400">
                Please wait {rateLimitCountdown} second{rateLimitCountdown !== 1 ? 's' : ''} before trying again.
              </p>
            </div>
          )}

          {/* Generic Error */}
          {error && error !== 'rate_limit' && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Result: No Path */}
          {result && result.path && result.path.length === 0 && (
            <div className="p-5 glass rounded-2xl border border-white/5 text-center space-y-2">
              <p className="text-sm text-slate-400">
                No known relationship path found between these two members.
              </p>
            </div>
          )}

          {/* Result: Path Found */}
          {result && result.path && result.path.length > 0 && (
            <div className="space-y-4">
              {/* AI Description */}
              {result.description && (
                <div className="p-5 glass rounded-2xl border border-brand-500/20 bg-brand-500/[0.03]">
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {result.description}
                  </p>
                </div>
              )}

              {/* AI Error fallback */}
              {result.error && !result.description && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-400">
                  AI description unavailable. Showing path only.
                </div>
              )}

              {/* Step-by-step Path */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">
                  Relationship Path
                </h3>
                <div className="glass rounded-2xl border border-white/5 p-4 space-y-0">
                  {result.path.map((step, index) => (
                    <div key={index}>
                      {/* Member name */}
                      <div className="flex items-center gap-2 py-2">
                        <span className="text-sm font-bold text-slate-200">
                          {getStepMemberName(step)}
                        </span>
                      </div>
                      {/* Arrow with relation type (not after last step) */}
                      {index < result.path.length - 1 && (
                        <div className="flex items-center gap-2 pl-2 py-1">
                          <ArrowRight size={14} className="text-brand-400 shrink-0" />
                          <span className="px-2 py-0.5 bg-brand-500/20 text-brand-300 rounded text-[10px] font-bold border border-brand-500/20 uppercase tracking-tight">
                            {step.relationType}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RelationshipPanel;
