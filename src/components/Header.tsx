import React from 'react';
import { Scissors } from 'lucide-react';

interface HeaderProps {
  onReset?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onReset }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={onReset}
          className="flex items-center gap-3 cursor-pointer select-none"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 via-rose-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-red-500/20">
            <Scissors className="w-5 h-5 -rotate-45" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">ClipCraft</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                4K Video Slicer
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Trim videos into custom duration parts with individual download buttons
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
