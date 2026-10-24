import React from 'react';
import { X, CheckCircle, Terminal, HelpCircle, Scissors, Download, ShieldAlert, Smartphone } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-semibold text-white">
              ClipCraft Guide &amp; Workflow
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-300">
          <div className="space-y-2">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-amber-400" />
              <span>1. Long-Form Video Slicing:</span>
            </h4>
            <p className="text-slate-400 leading-relaxed">
              Paste your YouTube link (or choose a demo video / upload an MP4). Use the
              interactive slider to drag each video duration to any length you want:
              <strong> 30 seconds for YouTube Shorts / TikTok</strong>, or <strong>2 minutes / 5 minutes / 7 minutes</strong> for full serialized parts.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <Download className="w-4 h-4 text-emerald-400" />
              <span>2. Individual Download Buttons:</span>
            </h4>
            <p className="text-slate-400 leading-relaxed">
              Every single clip part generated has its own prominent green <strong>Download Clip</strong> button.
              Clicking it initiates the rendering and immediately downloads the individual video file to your computer.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-rose-400" />
              <span>3. Format &amp; Aspect Ratio Switcher:</span>
            </h4>
            <p className="text-slate-400 leading-relaxed">
              Switch between <strong>YouTube Shorts (9:16)</strong>, <strong>TikTok (9:16)</strong>, <strong>Instagram (9:16 / 1:1)</strong>, and <strong>YouTube Landscape (16:9)</strong>.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>4. Audio Censor &amp; Bleeping:</span>
            </h4>
            <p className="text-slate-400 leading-relaxed">
              Need to bleep out bad words or mute background sounds? Open the <em>Bleep / Censor Audio</em> tool to set censor intervals that inject a broadcast 1000Hz tone.
            </p>
          </div>

          <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-blue-400" />
              <span>Pro Tip: yt-dlp &amp; FFmpeg Command Copy</span>
            </h4>
            <p className="text-slate-400 leading-relaxed">
              Each card also features a terminal icon. Clicking it copies the exact <code className="text-blue-300">yt-dlp</code> command to download pristine 4K/1080p stream sections directly.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-xl"
          >
            Got it, Let&apos;s Clip!
          </button>
        </div>
      </div>
    </div>
  );
};
