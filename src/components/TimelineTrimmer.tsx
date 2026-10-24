import React, { useRef, useState } from 'react';
import {
  Scissors,
  Plus,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Clock,
  Layers,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { ClipSegment } from '../types/trimmer';
import { formatTimestamp, validateClip } from '../utils/trimmerLogic';

interface TimelineTrimmerProps {
  totalDuration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  clips: ClipSegment[];
  activeClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onAddClip: (start: number, end: number, title?: string) => void;
  onAutoSplit: (durationSeconds: number) => void;
  onOpenCensorModal: () => void;
}

export const TimelineTrimmer: React.FC<TimelineTrimmerProps> = ({
  totalDuration,
  currentTime,
  onSeek,
  clips,
  activeClipId,
  onSelectClip,
  onAddClip,
  onAutoSplit,
  onOpenCensorModal,
}) => {
  const [inPoint, setInPoint] = useState<number>(0);
  const [outPoint, setOutPoint] = useState<number>(Math.min(totalDuration || 120, 120));
  const [customTitle, setCustomTitle] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timelineBarRef = useRef<HTMLDivElement>(null);

  // Set In/Out to current playhead
  const handleSetIn = () => {
    setInPoint(Math.round(currentTime * 10) / 10);
    if (outPoint <= currentTime) {
      setOutPoint(Math.min(totalDuration, Math.round((currentTime + 120) * 10) / 10));
    }
  };

  const handleSetOut = () => {
    if (currentTime <= inPoint) {
      setInPoint(Math.max(0, Math.round((currentTime - 120) * 10) / 10));
    }
    setOutPoint(Math.round(currentTime * 10) / 10);
  };

  // Timeline click or scrub
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineBarRef.current || totalDuration <= 0) return;
    const rect = timelineBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * totalDuration;
    onSeek(targetTime);
  };

  const handleCreateClipFromSelection = () => {
    setErrorMsg(null);
    const validation = validateClip(inPoint, outPoint, totalDuration);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid range');
      return;
    }

    const title = customTitle.trim() || `Clip #${clips.length + 1} (${formatTimestamp(inPoint)} - ${formatTimestamp(outPoint)})`;
    onAddClip(inPoint, outPoint, title);
    setCustomTitle('');
  };

  const inPercent = totalDuration > 0 ? (inPoint / totalDuration) * 100 : 0;
  const outPercent = totalDuration > 0 ? (outPoint / totalDuration) * 100 : 100;
  const playheadPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const selectionDuration = Math.max(0, outPoint - inPoint);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header and Quick Auto-Split Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Scissors className="w-4 h-4 text-red-500" />
            <span>Interactive Timeline Trimmer</span>
          </h3>
          <p className="text-xs text-slate-400">
            Select start & end timecodes, or 1-click auto-slice into parts
          </p>
        </div>

        {/* Action Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Main 2-minute split button */}
          <button
            type="button"
            onClick={() => onAutoSplit(120)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
            title="Auto-slice whole video into 2-minute clips"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Slice into 2-Min Parts</span>
          </button>

          <button
            type="button"
            onClick={() => onAutoSplit(60)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700/80 transition-colors cursor-pointer"
            title="Auto-slice into 60s clips for TikTok / Shorts"
          >
            <span>60s Shorts</span>
          </button>

          <button
            type="button"
            onClick={onOpenCensorModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/60 text-rose-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            title="Bleep or mute profanity and unwanted audio in clips"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>Bleep / Censor Audio</span>
          </button>
        </div>
      </div>

      {/* Visual Timeline Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-mono text-slate-400">
          <span>00:00</span>
          <span className="text-slate-200 font-semibold">
            Playhead: {formatTimestamp(currentTime, true)}
          </span>
          <span>{formatTimestamp(totalDuration)}</span>
        </div>

        <div
          ref={timelineBarRef}
          onClick={handleTimelineClick}
          className="relative h-12 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden cursor-pointer select-none group"
        >
          {/* Background Ruler Hash Marks */}
          <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="h-full border-r border-slate-500 w-0" />
            ))}
          </div>

          {/* Existing clips visual segments */}
          {clips.map((clip) => {
            const left = (clip.startTime / totalDuration) * 100;
            const width = (clip.duration / totalDuration) * 100;
            const isSelected = clip.id === activeClipId;

            return (
              <div
                key={clip.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClip(clip.id);
                  onSeek(clip.startTime);
                }}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: clip.color || '#3b82f6',
                }}
                className={`absolute top-1 bottom-1 rounded-md opacity-70 hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white font-mono font-medium truncate px-1 shadow-sm ${
                  isSelected ? 'ring-2 ring-white opacity-100' : ''
                }`}
                title={`${clip.title} (${formatTimestamp(clip.startTime)} - ${formatTimestamp(clip.endTime)})`}
              >
                <span className="truncate">{clip.title}</span>
              </div>
            );
          })}

          {/* Current Selection Range (In to Out) */}
          <div
            style={{
              left: `${Math.min(inPercent, outPercent)}%`,
              width: `${Math.abs(outPercent - inPercent)}%`,
            }}
            className="absolute top-0 bottom-0 bg-red-500/25 border-x-2 border-red-500 pointer-events-none z-10"
          />

          {/* Playhead Marker */}
          <div
            style={{ left: `${playheadPercent}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none shadow-[0_0_8px_rgba(251,191,36,0.8)]"
          >
            <div className="w-2.5 h-2.5 -translate-x-1 -translate-y-0.5 bg-amber-400 rotate-45 rounded-xs" />
          </div>
        </div>
      </div>

      {/* In / Out Marker Controls & Custom Clip Creator */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* In Point controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSetIn}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
            title="Set In point to current video position"
          >
            Set [In] (I)
          </button>
          <div className="flex items-center gap-1 font-mono">
            <span className="text-slate-400">In:</span>
            <input
              type="text"
              value={formatTimestamp(inPoint)}
              onChange={(e) => {
                // allow editing
              }}
              readOnly
              className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-center text-slate-100"
            />
          </div>
        </div>

        {/* Out Point controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSetOut}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
            title="Set Out point to current video position"
          >
            Set [Out] (O)
          </button>
          <div className="flex items-center gap-1 font-mono">
            <span className="text-slate-400">Out:</span>
            <input
              type="text"
              value={formatTimestamp(outPoint)}
              onChange={() => {}}
              readOnly
              className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-center text-slate-100"
            />
          </div>
        </div>

        {/* Selected Duration badge */}
        <div className="text-slate-400 flex items-center gap-1">
          <span>Clip Length:</span>
          <span className="font-mono font-semibold text-emerald-400">
            {formatTimestamp(selectionDuration)}
          </span>
        </div>

        {/* Add Clip Button */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Custom clip title (optional)"
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 placeholder-slate-500 text-xs w-48 focus:outline-none focus:border-red-500"
          />
          <button
            type="button"
            onClick={handleCreateClipFromSelection}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Clip</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-rose-400 font-medium">{errorMsg}</p>
      )}
    </div>
  );
};
