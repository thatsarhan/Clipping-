import React, { useState } from 'react';
import {
  Download,
  Play,
  Trash2,
  Copy,
  Check,
  Music,
  Terminal,
  ShieldAlert,
  Edit2,
  Clock,
  Sparkles,
  Smartphone,
  Film,
} from 'lucide-react';
import { ClipSegment, VideoMetadata, PlatformFormat } from '../types/trimmer';
import { formatTimestamp, estimateFileSizeMb, generateYtDlpCommand } from '../utils/trimmerLogic';
import { triggerDownload, triggerTextDownload } from '../utils/videoExporter';
import { createSyntheticAudioTrack, playCensorBeep } from '../utils/audioSynthesizer';
import { PLATFORM_CONFIGS } from '../data/platforms';

interface ClipCardProps {
  clip: ClipSegment;
  index: number;
  videoMeta: VideoMetadata;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onUpdate: (updated: Partial<ClipSegment>) => void;
  onDirectDownload: (clip: ClipSegment) => Promise<void>;
  platform: PlatformFormat;
  isDownloading?: boolean;
  downloadProgress?: number;
}

export const ClipCard: React.FC<ClipCardProps> = ({
  clip,
  index,
  videoMeta,
  isSelected,
  onSelect,
  onPreview,
  onDelete,
  onUpdate,
  onDirectDownload,
  platform,
  isDownloading = false,
  downloadProgress = 0,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(clip.title);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [isExportingAudio, setIsExportingAudio] = useState(false);

  const platformConfig = PLATFORM_CONFIGS[platform] || PLATFORM_CONFIGS.youtube;
  const isVertical = platformConfig.aspectRatio === '9:16';

  const handleSaveTitle = () => {
    setIsEditingTitle(false);
    if (titleInput.trim()) {
      onUpdate({ title: titleInput.trim() });
    }
  };

  const handleCopyYtDlp = async () => {
    const safeTitle = `part_${index + 1}_${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const cmd = generateYtDlpCommand(videoMeta.url, clip.startTime, clip.endTime, safeTitle);
    await navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleDownloadAudioOnly = async () => {
    setIsExportingAudio(true);
    try {
      const audioBlob = await createSyntheticAudioTrack(
        clip.duration,
        clip.censorRanges || []
      );
      const safeTitle = `audio_clip_${index + 1}_${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.wav`;
      triggerDownload(audioBlob, safeTitle);
    } catch (err) {
      console.error('Audio export error:', err);
    } finally {
      setIsExportingAudio(false);
    }
  };

  const handleStepTime = (type: 'start' | 'end', delta: number) => {
    if (type === 'start') {
      const newStart = Math.max(0, Math.min(clip.endTime - 1, clip.startTime + delta));
      onUpdate({
        startTime: Math.round(newStart * 10) / 10,
        duration: Math.round((clip.endTime - newStart) * 10) / 10,
      });
    } else {
      const newEnd = Math.max(clip.startTime + 1, Math.min(videoMeta.duration, clip.endTime + delta));
      onUpdate({
        endTime: Math.round(newEnd * 10) / 10,
        duration: Math.round((newEnd - clip.startTime) * 10) / 10,
      });
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`relative bg-slate-900 border rounded-2xl p-4 transition-all duration-200 shadow-md ${
        isSelected
          ? 'border-red-500/80 ring-1 ring-red-500/30 bg-slate-900/95'
          : 'border-slate-800 hover:border-slate-700 bg-slate-900/70'
      }`}
    >
      {/* Top Header: Part #, Title, Platform Pill, and Delete */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Color accent tag */}
          <div
            className="w-3 h-8 rounded-full shrink-0"
            style={{ backgroundColor: clip.color || '#3b82f6' }}
          />

          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                  autoFocus
                  className="bg-slate-950 border border-slate-700 text-xs text-white rounded px-2 py-0.5 w-full focus:outline-none focus:border-red-500"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <h4 className="text-sm font-semibold text-slate-100 truncate">
                  {clip.title}
                </h4>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingTitle(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-200 transition-opacity p-0.5 cursor-pointer"
                  title="Rename clip"
                  aria-label="Rename clip"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Subtitle details: timestamps & size estimate */}
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="font-mono text-slate-300">
                {formatTimestamp(clip.startTime)} - {formatTimestamp(clip.endTime)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-mono font-medium">
                {formatTimestamp(clip.duration)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-500">~{estimateFileSizeMb(clip.duration)}</span>
            </div>
          </div>
        </div>

        {/* Platform badge & Delete */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1 border ${
              isVertical
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
            }`}
          >
            {isVertical ? <Smartphone className="w-2.5 h-2.5" /> : <Film className="w-2.5 h-2.5" />}
            <span>{platformConfig.aspectRatio}</span>
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-slate-500 hover:text-rose-400 transition-colors rounded-md hover:bg-slate-800 cursor-pointer"
            title="Delete this clip"
            aria-label="Delete this clip"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timecode Steppers */}
      <div className="bg-slate-950/70 rounded-xl p-2.5 mb-3 border border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[11px]">Start:</span>
          <span className="font-mono font-semibold text-white bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            {formatTimestamp(clip.startTime, true)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStepTime('start', -1);
            }}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-400 cursor-pointer"
            title="Start -1s"
          >
            -1s
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStepTime('start', 1);
            }}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-400 cursor-pointer"
            title="Start +1s"
          >
            +1s
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[11px]">End:</span>
          <span className="font-mono font-semibold text-white bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            {formatTimestamp(clip.endTime, true)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStepTime('end', -1);
            }}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-400 cursor-pointer"
            title="End -1s"
          >
            -1s
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStepTime('end', 1);
            }}
            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-400 cursor-pointer"
            title="End +1s"
          >
            +1s
          </button>
        </div>
      </div>

      {/* Primary Actions: Play Preview & THE INDIVIDUAL DOWNLOAD BUTTON */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
        {/* Play Preview */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors cursor-pointer"
          title="Play this clip segment in the player"
        >
          <Play className="w-3.5 h-3.5 fill-slate-300" />
          <span>Preview</span>
        </button>

        {/* THE INDIVIDUAL DOWNLOAD BUTTON */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDirectDownload(clip);
          }}
          disabled={isDownloading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
          title="Download this individual clip"
        >
          <Download className="w-4 h-4" />
          <span>
            {isDownloading
              ? `Rendering... ${downloadProgress}%`
              : `Download ${clip.duration}s Clip`}
          </span>
        </button>

        {/* Audio Only */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDownloadAudioOnly();
          }}
          disabled={isExportingAudio}
          className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors cursor-pointer"
          title="Download audio only (.wav)"
          aria-label="Download audio only"
        >
          <Music className="w-3.5 h-3.5" />
        </button>

        {/* Copy yt-dlp command */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCopyYtDlp();
          }}
          className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors cursor-pointer"
          title="Copy yt-dlp segment download command"
          aria-label="Copy terminal command"
        >
          {copiedCmd ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Terminal className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* In-progress bar if actively rendering */}
      {isDownloading && (
        <div className="mt-2.5 w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-500 h-full transition-all duration-150"
            style={{ width: `${downloadProgress}%` }}
          />
        </div>
      )}
    </div>
  );
};
