import React, { useState } from 'react';
import { X, LogIn, Phone } from 'lucide-react';

const LoginModal = ({ onLogin, onCancel }) => {
  const [phone, setPhone] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (phone.trim().length >= 10) {
      onLogin(phone);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
        <div className="glass-heavy w-full max-w-sm rounded-[2rem] p-8 space-y-6 animate-slide-up shadow-2xl">
            <div className="text-center space-y-2">
                <div className="mx-auto w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center text-brand-400">
                    <LogIn size={32} />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">Welcome Back</h2>
                <p className="text-slate-400 text-sm">Enter your phone number to start editing</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                    <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-lg text-white placeholder-slate-600 focus:outline-none focus:ring-4 focus:ring-brand-500/20 focus:border-brand-500/50 transition-all"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      autoFocus
                    />
                </div>

                <div className="flex gap-3">
                    <button 
                      type="button" 
                      onClick={onCancel}
                      className="flex-1 py-4 text-slate-400 font-bold uppercase tracking-widest text-xs hover:text-white transition-colors"
                    >
                        Maybe Later
                    </button>
                    <button 
                      type="submit" 
                      disabled={phone.trim().length < 10}
                      className="flex-[2] py-4 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-xl shadow-brand-900/40 transition-all active:scale-95"
                    >
                        Sign In
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};

export default LoginModal;
