import React, { useState } from 'react';
import {
  Download,
  FolderArchive,
  Terminal,
  Plus,
  Scissors,
  Layers,
  Sparkles,
  Search,
} from 'lucide-react';
import { ClipSegment, VideoMetadata, PlatformFormat } from '../types/trimmer';
import { ClipCard } from './ClipCard';
import { formatTimestamp } from '../utils/trimmerLogic';

interface ClipsListProps {
  clips: ClipSegment[];
  videoMeta: VideoMetadata;
  activeClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onPreviewClip: (clip: ClipSegment) => void;
  onDeleteClip: (clipId: string) => void;
  onUpdateClip: (clipId: string, updated: Partial<ClipSegment>) => void;
  onDirectDownloadClip: (clip: ClipSegment) => Promise<void>;
  onDownloadAllZip: () => void;
  onExportShellScript: () => void;
  onAddNewClip: () => void;
  platform: PlatformFormat;
  downloadingClipId: string | null;
  downloadProgress: number;
}

export const ClipsList: React.FC<ClipsListProps> = ({
  clips,
  videoMeta,
  activeClipId,
  onSelectClip,
  onPreviewClip,
  onDeleteClip,
  onUpdateClip,
  onDirectDownloadClip,
  onDownloadAllZip,
  onExportShellScript,
  onAddNewClip,
  platform,
  downloadingClipId,
  downloadProgress,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredClips = clips.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalClipsDuration = clips.reduce((acc, c) => acc + c.duration, 0);

  return (
    <div className="space-y-4">
      {/* List Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Generated Clip Parts ({clips.length})
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Total: {formatTimestamp(totalClipsDuration)}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Each part has an individual download button ready to export
            </p>
          </div>
        </div>

        {/* Global Batch Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddNewClip}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Part</span>
          </button>

          <button
            type="button"
            onClick={onExportShellScript}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-xl border border-slate-800 transition-colors cursor-pointer"
            title="Download script for yt-dlp / FFmpeg"
          >
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            <span>Export Script (.sh)</span>
          </button>

          <button
            type="button"
            onClick={onDownloadAllZip}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            title="Package all individual parts into one zip"
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>Download All (.zip)</span>
          </button>
        </div>
      </div>

      {/* Optional Search if many parts */}
      {clips.length > 5 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search generated parts..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
          />
        </div>
      )}

      {/* Grid of Clip Cards */}
      {filteredClips.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredClips.map((clip, idx) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={idx}
              videoMeta={videoMeta}
              isSelected={clip.id === activeClipId}
              onSelect={() => onSelectClip(clip.id)}
              onPreview={() => onPreviewClip(clip)}
              onDelete={() => onDeleteClip(clip.id)}
              onUpdate={(updated) => onUpdateClip(clip.id, updated)}
              onDirectDownload={onDirectDownloadClip}
              platform={platform}
              isDownloading={downloadingClipId === clip.id}
              downloadProgress={downloadProgress}
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-8 text-center">
          <Scissors className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-slate-300">No clips generated yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Choose your desired duration slider above (e.g. 2 minutes or 30 seconds) and click
            &ldquo;Slice Video Now&rdquo; to create parts with individual download buttons.
          </p>
        </div>
      )}
    </div>
  );
};
