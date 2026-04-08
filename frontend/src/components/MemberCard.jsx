import React from 'react';
import { Share2, MapPin, Phone, Calendar } from 'lucide-react';

const MemberCard = ({ member, onRelationStart, isHovered }) => {
  const calculateAge = (m) => {
    if (m.dob) {
      const birthDate = new Date(m.dob);
      if (isNaN(birthDate.getTime())) return null;
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const month = today.getMonth() - birthDate.getMonth();
      if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    }
    
    if (m.manualAge) {
      const updateDate = new Date(m.updatedAt || m.createdAt || new Date());
      const currentYear = new Date().getFullYear();
      const yearsElapsed = currentYear - updateDate.getFullYear();
      return Number(m.manualAge) + yearsElapsed;
    }

    return null;
  };

  const age = calculateAge(member);
  const genderColor = member.gender === 'Female' ? 'border-pink-500/30' : 
                      member.gender === 'Male' ? 'border-brand-500/30' : 
                      'border-slate-500/30';

  return (
    <div 
      className={`member-card w-48 p-3 flex flex-col items-center gap-2 animate-fade-in border-t-2 ${genderColor}`}
      style={{ pointerEvents: 'none' }}
    >
      <div className={`relative w-16 h-16 rounded-full overflow-hidden border-2 ${genderColor}`}>
        {member.photoUrl ? (
          <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-brand-900/50 flex items-center justify-center text-brand-300 font-bold text-xl uppercase">
            {member.name ? member.name[0] : '?'}
          </div>
        )}
      </div>

      <div className="text-center w-full">
        <h3 className="text-sm font-semibold truncate text-white">
          {member.name}
          {age && <span className="ml-1 text-[10px] text-slate-400 font-normal">({age})</span>}
        </h3>
        {member.location && (
            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
                <MapPin size={8} />
                <span className="truncate">{member.location}</span>
            </div>
        )}
      </div>

      {/* Relation Button (Shown based on isHovered prop) */}
      <button 
        onClick={(e) => { e.stopPropagation(); onRelationStart(); }}
        className={`absolute -top-2 -right-2 p-2 glass rounded-full transition-all hover:bg-brand-500/20 active:scale-90 ${
          isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
        }`}
        style={{ pointerEvents: isHovered ? 'auto' : 'none' }}
      >
        <Share2 size={14} className="text-brand-300" />
      </button>
    </div>
  );
};

export default MemberCard;
