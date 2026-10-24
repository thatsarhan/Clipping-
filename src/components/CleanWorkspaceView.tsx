import React, { useState } from 'react';
import { ArrowLeft, FolderArchive } from 'lucide-react';
import { ClipSegment, VideoMetadata, PlatformFormat, VideoQuality } from '../types/trimmer';
import { NativeVideoClipCard } from './NativeVideoClipCard';
import { formatTimestamp } from '../utils/trimmerLogic';
import { downloadAllClipsZip } from '../utils/videoExporter';

interface CleanWorkspaceViewProps {
  videoMeta: VideoMetadata;
  clips: ClipSegment[];
  platform: PlatformFormat;
  quality: VideoQuality;
  onBackToSetup: () => void;
}

export const CleanWorkspaceView: React.FC<CleanWorkspaceViewProps> = ({
  videoMeta,
  clips,
  platform,
  quality,
  onBackToSetup,
}) => {
  const [isZippingAll, setIsZippingAll] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const handleDownloadAll = async () => {
    setIsZippingAll(true);
    setZipProgress(10);
    try {
      await downloadAllClipsZip(videoMeta, clips, (p) => setZipProgress(p));
    } catch (e) {
      console.error(e);
    } finally {
      setIsZippingAll(false);
      setZipProgress(0);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header Banner: Back button, Title, and Download All */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToSetup}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← New Video / Settings</span>
          </button>

          <div>
            <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-md">
              {videoMeta.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="font-mono">{formatTimestamp(videoMeta.duration)} Total</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-semibold">{quality.toUpperCase()} UHD</span>
              <span aria-hidden="true">·</span>
              <span className="text-red-400 uppercase font-semibold">{platform}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300 font-medium">{clips.length} Parts</span>
            </div>
          </div>
        </div>

        {/* Prominent DOWNLOAD ALL Button right at top */}
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={isZippingAll}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all cursor-pointer disabled:opacity-50"
        >
          <FolderArchive className="w-4 h-4" />
          <span>{isZippingAll ? `Packaging ZIP (${zipProgress}%)...` : `Download All (${clips.length} Clips)`}</span>
        </button>
      </div>

      {/* Grid of Playable Native MP4 Video Parts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {clips.map((clip, index) => (
          <NativeVideoClipCard
            key={clip.id}
            clip={clip}
            index={index}
            videoMeta={videoMeta}
            platform={platform}
            quality={quality}
          />
        ))}
      </div>
    </div>
  );
};
