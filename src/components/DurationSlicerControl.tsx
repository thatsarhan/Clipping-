import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Layers,
  Sparkles,
  Check,
  Film,
  Smartphone,
  Share2,
  Clock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { PlatformFormat } from '../types/trimmer';
import { PLATFORM_CONFIGS } from '../data/platforms';
import { formatTimestamp } from '../utils/trimmerLogic';

interface DurationSlicerControlProps {
  totalDuration: number;
  currentSliceSeconds: number;
  onSliceSecondsChange: (seconds: number) => void;
  selectedPlatform: PlatformFormat;
  onPlatformChange: (platform: PlatformFormat) => void;
  onApplySplit: (seconds: number) => void;
}

export const DurationSlicerControl: React.FC<DurationSlicerControlProps> = ({
  totalDuration,
  currentSliceSeconds,
  onSliceSecondsChange,
  selectedPlatform,
  onPlatformChange,
  onApplySplit,
}) => {
  const [dragSeconds, setDragSeconds] = useState<number>(currentSliceSeconds);

  // Sync if external prop updates
  useEffect(() => {
    setDragSeconds(currentSliceSeconds);
  }, [currentSliceSeconds]);

  const maxDuration = Math.max(10, Math.floor(totalDuration || 600));

  // Compute breakdown preview
  const numFullParts = Math.floor(totalDuration / Math.max(1, dragSeconds));
  const remainder = totalDuration % Math.max(1, dragSeconds);
  const totalParts = numFullParts + (remainder > 1 ? 1 : 0);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setDragSeconds(val);
    onSliceSecondsChange(val);
  };

  const handlePresetClick = (seconds: number) => {
    const clamped = Math.min(maxDuration, seconds);
    setDragSeconds(clamped);
    onSliceSecondsChange(clamped);
  };

  const currentPlatformConfig = PLATFORM_CONFIGS[selectedPlatform] || PLATFORM_CONFIGS.youtube;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Title & Description */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Video Duration & Platform Slicer
            </h3>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
              Customizable Slicing
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Drag the slider to set each clip length (e.g. 30s Shorts or 7m parts). The last clip takes any remaining time.
          </p>
        </div>

        {/* Live parts badge */}
        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400">Yields:</span>
          <span className="font-semibold text-white">{totalParts} individual clips</span>
        </div>
      </div>

      {/* Target Social Platform Format Selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
          <span>Target Export Format & Aspect Ratio:</span>
          <span className="text-slate-400 text-[11px]">
            Aspect Ratio: <strong className="text-white">{currentPlatformConfig.aspectRatio}</strong>
          </span>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Object.values(PLATFORM_CONFIGS).map((platform) => {
            const isSelected = selectedPlatform === platform.id;
            return (
              <button
                key={platform.id}
                type="button"
                onClick={() => {
                  onPlatformChange(platform.id as PlatformFormat);
                  // Suggest ideal duration if clicked
                  if (platform.idealDurationSeconds <= maxDuration) {
                    handlePresetClick(platform.idealDurationSeconds);
                  }
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-800 border-red-500 ring-1 ring-red-500/50 shadow-md'
                    : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                    {platform.aspectRatio === '9:16' ? (
                      <Smartphone className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <Film className="w-3.5 h-3.5 text-blue-400" />
                    )}
                    {platform.name}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-red-400" />}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono">{platform.aspectRatio}</span>
                  <span>{platform.idealDurationSeconds}s rec.</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Drag Slider & Steppers */}
      <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-slate-200">
              Each Clip Duration:
            </span>
            <span className="font-mono text-base font-bold text-white bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-800">
              {formatTimestamp(dragSeconds)} ({dragSeconds} seconds)
            </span>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500 text-[11px]">Presets:</span>
            {[
              { label: '30s (Shorts)', sec: 30 },
              { label: '60s (TikTok)', sec: 60 },
              { label: '2 min (120s)', sec: 120 },
              { label: '5 min (300s)', sec: 300 },
              { label: '7 min (420s)', sec: 420 },
            ]
              .filter((p) => p.sec <= maxDuration)
              .map((p) => (
                <button
                  key={p.sec}
                  type="button"
                  onClick={() => handlePresetClick(p.sec)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    dragSeconds === p.sec
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
          </div>
        </div>

        {/* Range Slider */}
        <div className="space-y-1">
          <input
            type="range"
            min={10}
            max={maxDuration}
            step={5}
            value={dragSeconds}
            onChange={handleSliderChange}
            className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400"
            aria-label="Clip length slider"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-500">
            <span>Min: 10s</span>
            <span>Current: {formatTimestamp(dragSeconds)}</span>
            <span>Max (Full Video): {formatTimestamp(totalDuration)}</span>
          </div>
        </div>

        {/* Live Calculation Callout: Example 10m -> 7m + 3m */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>
              {numFullParts > 0 ? (
                <>
                  <strong className="text-white">{numFullParts}</strong> part{numFullParts > 1 ? 's' : ''} of{' '}
                  <strong className="text-white">{formatTimestamp(dragSeconds)}</strong>
                  {remainder > 1 && (
                    <>
                      {' '}
                      + 1 remaining part of <strong className="text-amber-400">{formatTimestamp(remainder)}</strong>
                    </>
                  )}
                </>
              ) : (
                <span>Whole video will be 1 clip</span>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onApplySplit(dragSeconds)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            <span>Slice Video Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
