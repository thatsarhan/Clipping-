import React, { useState } from 'react';
import { ShieldAlert, VolumeX, Volume2, Plus, Trash2, X, Check } from 'lucide-react';
import { playCensorBeep } from '../utils/audioSynthesizer';
import { formatTimestamp } from '../utils/trimmerLogic';

interface CensorRange {
  id: string;
  start: number;
  end: number;
  label: string;
}

interface CensorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTime: number;
  totalDuration: number;
  onSaveCensorRanges: (ranges: { start: number; end: number }[]) => void;
  existingRanges?: { start: number; end: number }[];
}

export const CensorModal: React.FC<CensorModalProps> = ({
  isOpen,
  onClose,
  currentTime,
  totalDuration,
  onSaveCensorRanges,
  existingRanges = [],
}) => {
  const [ranges, setRanges] = useState<CensorRange[]>(() =>
    existingRanges.map((r, i) => ({
      id: `censor_${i}`,
      start: r.start,
      end: r.end,
      label: `Censor #${i + 1}`,
    }))
  );

  const [newStart, setNewStart] = useState<number>(Math.max(0, Math.round(currentTime)));
  const [newEnd, setNewEnd] = useState<number>(Math.min(totalDuration, Math.round(currentTime + 2)));
  const [label, setLabel] = useState('Profanity / Bleep');

  if (!isOpen) return null;

  const handleTestBeep = () => {
    playCensorBeep(600, 0.3);
  };

  const handleAddRange = () => {
    if (newEnd <= newStart) return;
    const item: CensorRange = {
      id: `censor_${Date.now()}`,
      start: newStart,
      end: newEnd,
      label: label.trim() || 'Profanity / Bleep',
    };
    setRanges([...ranges, item]);
  };

  const handleDeleteRange = (id: string) => {
    setRanges(ranges.filter((r) => r.id !== id));
  };

  const handleApply = () => {
    onSaveCensorRanges(ranges.map((r) => ({ start: r.start, end: r.end })));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-semibold text-white">
              Audio Censor &amp; Profanity Bleep Manager
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-400">
            Automatically bleep out (1000Hz tone) or mute bad words and unwanted sound in your video clips.
          </p>

          {/* Test Bleep Tone */}
          <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-300">Test Standard 1000Hz Censor Beep:</span>
            <button
              type="button"
              onClick={handleTestBeep}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg font-medium transition-colors cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Play Beep Tone</span>
            </button>
          </div>

          {/* Add New Censor Window */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-200">Add Censor / Mute Window:</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">Start (seconds):</label>
                <input
                  type="number"
                  min={0}
                  max={totalDuration}
                  value={newStart}
                  onChange={(e) => setNewStart(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">End (seconds):</label>
                <input
                  type="number"
                  min={newStart}
                  max={totalDuration}
                  value={newEnd}
                  onChange={(e) => setNewEnd(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Reason (e.g. f*** word bleep)"
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500"
              />
              <button
                type="button"
                onClick={handleAddRange}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Range</span>
              </button>
            </div>
          </div>

          {/* List of active censor ranges */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-300">
              Active Censor Ranges ({ranges.length}):
            </h4>
            {ranges.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No audio censor ranges added yet.</p>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {ranges.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 font-mono">
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-white font-semibold">
                        {formatTimestamp(r.start)} - {formatTimestamp(r.end)}
                      </span>
                      <span className="text-slate-400 text-[11px]">({r.label})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRange(r.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm"
          >
            Apply Censor to Clips
          </button>
        </div>
      </div>
    </div>
  );
};
