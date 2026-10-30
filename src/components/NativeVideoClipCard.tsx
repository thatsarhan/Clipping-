import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  MoreVertical,
  Share2,
  Check,
  Film,
  Smartphone,
  Play,
  Pause,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { ClipSegment, VideoMetadata, PlatformFormat, VideoQuality } from '../types/trimmer';
import { formatTimestamp } from '../utils/trimmerLogic';
import { triggerDownload } from '../utils/videoExporter';

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
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [activeVideoSrc, setActiveVideoSrc] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);

  const isVertical = platform === 'shorts' || platform === 'tiktok' || platform === 'instagram';

  const targetThumb = clip.thumbnailUrl || videoMeta.thumbnailUrl;

  // Safely check if thumbnail URL is valid to prevent broken image icon
  useEffect(() => {
    if (targetThumb) {
      const img = new Image();
      img.onload = () => setPosterLoaded(true);
      img.onerror = () => setPosterLoaded(false);
      img.src = targetThumb;
    } else {
      setPosterLoaded(false);
    }
  }, [targetThumb]);

  // Set active video source
  useEffect(() => {
    if (clip.videoBlobUrl) {
      setActiveVideoSrc(clip.videoBlobUrl);
    } else if (clip.serverClipUrl) {
      setActiveVideoSrc(clip.serverClipUrl);
    } else if (videoMeta.type === 'sample' && videoMeta.url) {
      setActiveVideoSrc(`${videoMeta.url}#t=${clip.startTime},${clip.endTime}`);
    }
  }, [clip.videoBlobUrl, clip.serverClipUrl, videoMeta.type, videoMeta.url, clip.startTime, clip.endTime]);

  // Direct download link on full-stack server
  const directDownloadUrl = clip.serverClipUrl
    ? `${clip.serverClipUrl}${clip.serverClipUrl.includes('?') ? '&' : '?'}download=1`
    : '';

  // Download handler: Downloads the genuine MP4 file directly
  const handleDownloadPart = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadSuccess(false);
    setDownloadError(null);

    const safeFilename = `Part_${index + 1}_${quality}.mp4`;

    try {
      // 1. If we have a local blob URL in memory, trigger instant download
      if (clip.videoBlobUrl) {
        const bRes = await fetch(clip.videoBlobUrl);
        const bBlob = await bRes.blob();
        if (bBlob.size > 5000) {
          triggerDownload(bBlob, safeFilename);
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 3000);
          return;
        }
      }

      // 2. If we have server trimmed clip endpoint, fetch and save real MP4
      if (clip.serverClipUrl) {
        const fetchUrl = directDownloadUrl || clip.serverClipUrl;
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const blob = await res.blob();
          // Ensure it's a real video (>10KB) and not a JSON error message
          if (blob.size > 10000 && !blob.type.includes('json')) {
            triggerDownload(blob, safeFilename);
            setDownloadSuccess(true);
            setTimeout(() => setDownloadSuccess(false), 3000);
            return;
          }
        }
      }

      // If clip is not available
      throw new Error(`Trimmed video file for Part ${index + 1} is not available on server.`);
    } catch (err: unknown) {
      console.error('Download part error:', err);
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
      setTimeout(() => setDownloadError(null), 4000);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const urlToCopy = directDownloadUrl
        ? window.location.origin + directDownloadUrl
        : window.location.href;
      await navigator.clipboard.writeText(urlToCopy);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      setIsMenuOpen(false);
    } catch {}
  };

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      setIsVideoLoading(true);
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsVideoLoading(false);
        })
        .catch(() => {
          setIsVideoLoading(false);
        });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between transition-all hover:border-slate-700">
      {/* Top Header: Part Headline & Timestamps */}
      <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Clip {String(index + 1).padStart(2, '0')}
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
              Trimmed MP4
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            {formatTimestamp(clip.startTime)} - {formatTimestamp(clip.endTime)}
            <span className="text-slate-600 mx-1.5">·</span>
            <span className="text-emerald-400 font-semibold">{clip.duration}s Clip</span>
            {clip.fileSize ? (
              <>
                <span className="text-slate-600 mx-1.5">·</span>
                <span className="text-slate-300 font-medium">
                  {(clip.fileSize / (1024 * 1024)).toFixed(1)} MB
                </span>
              </>
            ) : null}
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
            <div className="absolute right-0 top-10 w-52 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-20 space-y-1">
              <button
                type="button"
                onClick={() => {
                  handleDownloadPart();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors cursor-pointer text-left"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download Part {index + 1} MP4</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-left"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Direct Video Link'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Playable Trimmed Video Player */}
      <div className="flex-1 flex items-center justify-center my-2">
        <div
          className={`w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center relative group ${
            isVertical ? 'aspect-[9/16] max-w-[260px] mx-auto' : 'aspect-video'
          }`}
        >
          {activeVideoSrc ? (
            <video
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              poster={posterLoaded ? targetThumb : undefined}
              src={activeVideoSrc}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onWaiting={() => setIsVideoLoading(true)}
              onPlaying={() => setIsVideoLoading(false)}
              className="w-full h-full object-cover"
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            /* Elegant Fallback Surface (Never broken image icon) */
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-950 to-slate-900 text-slate-400">
              <Film className="w-8 h-8 text-slate-600 mb-2" />
              <span className="text-xs font-semibold text-slate-300">Part {index + 1} Clip</span>
              <span className="text-[11px] text-slate-500 font-mono mt-0.5">{clip.duration}s ready</span>
            </div>
          )}

          {/* Central Play/Pause Overlay */}
          {activeVideoSrc && !isPlaying && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={`Play trimmed Part ${index + 1}`}
              className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/75 hover:bg-red-600 text-white flex items-center justify-center backdrop-blur-xs transition-all shadow-lg hover:scale-110 cursor-pointer pointer-events-auto"
            >
              {isVideoLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              ) : (
                <Play className="w-6 h-6 fill-white ml-0.5" />
              )}
            </button>
          )}

          {/* Duration Pill at bottom-left */}
          <div className="absolute bottom-2 left-2 pointer-events-none px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center gap-1 z-10">
            <span>0:00 / {formatTimestamp(clip.duration)}</span>
          </div>
        </div>
      </div>

      {/* Error alert toast if download issue */}
      {downloadError && (
        <div className="my-2 p-2 rounded-lg bg-red-950/80 border border-red-800 text-[11px] text-red-300 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      {/* Bottom Bar: Format Tag and Direct Download Button */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          {isVertical ? <Smartphone className="w-3.5 h-3.5 text-rose-400" /> : <Film className="w-3.5 h-3.5 text-blue-400" />}
          <span>{isVertical ? '9:16 Shorts' : '16:9 Landscape'}</span>
          <span className="text-slate-600">·</span>
          <span className="text-white font-semibold">{quality.toUpperCase()}</span>
        </div>

        {/* Primary Individual Download Button */}
        <button
          type="button"
          onClick={handleDownloadPart}
          disabled={isDownloading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-60"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Fetching Part {index + 1}...</span>
            </>
          ) : downloadSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-white" />
              <span>Downloaded!</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Download Part {index + 1}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
