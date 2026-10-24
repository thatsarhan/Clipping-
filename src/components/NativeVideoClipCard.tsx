import React, { useState } from 'react';
import {
  Download,
  MoreVertical,
  Share2,
  Check,
  Film,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { ClipSegment, VideoMetadata, PlatformFormat, VideoQuality } from '../types/trimmer';
import { formatTimestamp } from '../utils/trimmerLogic';

interface NativeVideoClipCardProps {
  clip: ClipSegment;
  index: number;
  videoMeta: VideoMetadata;
  platform: PlatformFormat;
  quality: VideoQuality;
}

export const NativeVideoClipCard: React.FC<NativeVideoClipCardProps> = ({
  clip,
  index,
  videoMeta,
  platform,
  quality,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const isVertical = platform === 'shorts' || platform === 'tiktok' || platform === 'instagram';

  // Stream URL for native HTML5 video player
  const streamUrl = `/api/stream-clip?url=${encodeURIComponent(videoMeta.url)}&start=${clip.startTime}&end=${clip.endTime}&quality=${quality}&format=${platform}`;

  // Download URL
  const downloadUrl = `/api/download-clip?url=${encodeURIComponent(videoMeta.url)}&start=${clip.startTime}&end=${clip.endTime}&quality=${quality}&format=${platform}&title=${encodeURIComponent(`Part_${index + 1}`)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + downloadUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      setIsMenuOpen(false);
    } catch {}
  };

  const handleTriggerDownload = () => {
    setIsDownloading(true);
    setTimeout(() => setIsDownloading(false), 3000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between transition-all hover:border-slate-700">
      {/* Top Header: Part Headline, Timestamps, and 3-Dots Menu */}
      <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-800/80">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Part {index + 1}
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            {formatTimestamp(clip.startTime)} - {formatTimestamp(clip.endTime)}
            <span className="text-slate-600 mx-1.5">·</span>
            <span className="text-emerald-400 font-semibold">{clip.duration}s</span>
          </p>
        </div>

        {/* 3-Dots Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors cursor-pointer"
            title="Options menu"
            aria-label={`Options for Part ${index + 1}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Dropdown with Download and Copy Link */}
          {isMenuOpen && (
            <div className="absolute right-0 top-10 w-48 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-20 space-y-1">
              <a
                href={downloadUrl}
                download={`Part_${index + 1}.mp4`}
                onClick={() => {
                  handleTriggerDownload();
                  setIsMenuOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download MP4 Video</span>
              </a>

              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Download Link'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Playable Native HTML5 MP4 Video Player */}
      <div className="flex-1 flex items-center justify-center my-2">
        <div
          className={`w-full bg-black rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center relative ${
            isVertical ? 'aspect-[9/16] max-w-[260px] mx-auto' : 'aspect-video'
          }`}
        >
          <video
            controls
            playsInline
            preload="metadata"
            src={streamUrl}
            className="w-full h-full object-contain"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>

      {/* Bottom Bar: Format Tag and Direct Download Button */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          {isVertical ? <Smartphone className="w-3.5 h-3.5 text-rose-400" /> : <Film className="w-3.5 h-3.5 text-blue-400" />}
          <span>{isVertical ? '9:16 Shorts' : '16:9 Landscape'}</span>
          <span className="text-slate-600">·</span>
          <span className="text-white font-semibold">{quality.toUpperCase()}</span>
        </div>

        {/* Primary Individual Download Button */}
        <a
          href={downloadUrl}
          download={`Part_${index + 1}.mp4`}
          onClick={handleTriggerDownload}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isDownloading ? 'Downloading MP4...' : `Download Part ${index + 1}`}</span>
        </a>
      </div>
    </div>
  );
};
