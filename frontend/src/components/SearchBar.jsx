import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User } from 'lucide-react';
import { memberApi } from '../api';

const SearchBar = ({ onSelectMember }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const data = await memberApi.searchMembers(query.trim());
        setResults(data);
        setIsOpen(true);
      } catch (err) {
        console.error('Search failed', err);
        setError('Search unavailable');
        setResults([]);
        setIsOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback((member) => {
    onSelectMember(member);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  }, [onSelectMember]);

  const getGenderColor = (gender) => {
    if (gender === 'Male') return 'text-blue-400';
    if (gender === 'Female') return 'text-pink-400';
    return 'text-slate-400';
  };

  const getGenderLabel = (gender) => {
    if (gender === 'Male') return '♂';
    if (gender === 'Female') return '♀';
    return '⚬';
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="glass px-3 py-2 rounded-xl flex items-center gap-2 text-sm min-w-[220px]">
        <Search size={16} className="text-brand-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members..."
          className="bg-transparent border-none outline-none text-white placeholder-slate-500 text-sm w-full"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
            }}
            className="p-0.5 hover:bg-white/10 rounded transition-colors"
          >
            <X size={14} className="text-slate-400" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 glass rounded-xl overflow-hidden shadow-2xl shadow-black/60 z-50 max-h-[320px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-sm text-slate-400 text-center">
              Searching...
            </div>
          )}

          {error && (
            <div className="px-4 py-3 text-sm text-red-400 text-center">
              {error}
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">
              No members found
            </div>
          )}

          {!loading && !error && results.map((member) => (
            <button
              key={member.id}
              onClick={() => handleSelect(member)}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"
            >
              {/* Photo Thumbnail */}
              {member.photoUrl ? (
                <img
                  src={member.photoUrl}
                  alt={member.name}
                  className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <User size={14} className="text-slate-500" />
                </div>
              )}

              {/* Name */}
              <span className="text-sm text-slate-200 font-medium truncate flex-1">
                {member.name}
              </span>

              {/* Gender Icon */}
              <span className={`text-base font-bold shrink-0 ${getGenderColor(member.gender)}`}>
                {getGenderLabel(member.gender)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
