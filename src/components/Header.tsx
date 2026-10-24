import React from 'react';
import { Scissors, Sparkles, Youtube, Video, HelpCircle } from 'lucide-react';

interface HeaderProps {
  onOpenHelp: () => void;
  onOpenSample: (sampleId: string) => void;
  totalClips: number;
}

export const Header: React.FC<HeaderProps> = ({ onOpenHelp, onOpenSample, totalClips }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 via-rose-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-red-500/20">
            <Scissors className="w-5 h-5 -rotate-45" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">ClipCraft</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                YouTube Trimmer
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Slice videos into 2-min parts with individual download buttons
            </p>
          </div>
        </div>

        {/* Quick Sample Presets & Help */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
            <span>Quick Samples:</span>
            <button
              onClick={() => onOpenSample('sample_podcast')}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Podcast (10m)
            </button>
            <button
              onClick={() => onOpenSample('sample_nature')}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Nature (11m)
            </button>
          </div>

          <button
            onClick={onOpenHelp}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            aria-label="How it works"
          >
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Guide & Shortcuts</span>
          </button>
        </div>
      </div>
    </header>
  );
};
