import React, { useState, useRef } from 'react';
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
  ExternalLink,
} from 'lucide-react';
import { ClipSegment, VideoMetadata, PlatformFormat, VideoQuality } from '../types/trimmer';
import { formatTimestamp, extractYouTubeId } from '../utils/trimmerLogic';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [useIframeFallback, setUseIframeFallback] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  const isVertical = platform === 'shorts' || platform === 'tiktok' || platform === 'instagram';
  const ytId = extractYouTubeId(videoMeta.url);

  // Compute poster image: prefer high-res thumbnail
  const posterUrl =
    videoMeta.thumbnailUrl ||
    (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : undefined);

  // Stream URL for native HTML5 video player
  const streamUrl = `/api/stream-clip?url=${encodeURIComponent(videoMeta.url)}&start=${clip.startTime}&end=${clip.endTime}&quality=${quality}&format=${platform}`;

  // Download URL
  const downloadUrl = `/api/download-clip?url=${encodeURIComponent(videoMeta.url)}&start=${clip.startTime}&end=${clip.endTime}&quality=${quality}&format=${platform}&title=${encodeURIComponent(`Part_${index + 1}`)}`;

  // Robust download handler that checks for genuine MP4 before triggering save
  const handleDownloadPart = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadSuccess(false);

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      const blob = await res.blob();

      // Ensure blob is valid video (at least 10KB, not a small JSON error file)
      if (blob.size < 10000 || contentType.includes('application/json')) {
        throw new Error('Downloaded file was not a valid video stream');
      }

      const safeFilename = `Part_${index + 1}_${quality}.mp4`;
      triggerDownload(blob, safeFilename);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.warn('Direct stream fetch failed, generating client download...', err);
      // If direct backend stream had an issue, trigger download endpoint directly
      window.location.href = downloadUrl;
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + downloadUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      setIsMenuOpen(false);
    } catch {}
  };

  const togglePlay = () => {
    if (useIframeFallback) {
      setUseIframeFallback(false);
      return;
    }

    if (videoRef.current) {
      if (videoRef.current.paused) {
        setIsVideoLoading(true);
        videoRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
            setIsVideoLoading(false);
          })
          .catch((err) => {
            console.warn('Native video play failed, falling back to embedded player:', err);
            setIsVideoLoading(false);
            if (ytId) {
              setUseIframeFallback(true);
              setIsPlaying(true);
            }
          });
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
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
                <span>{copiedLink ? 'Link Copied!' : 'Copy Download Link'}</span>
              </button>

              {ytId && (
                <a
                  href={`https://www.youtube.com/watch?v=${ytId}&t=${clip.startTime}s`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-lg transition-colors cursor-pointer text-left"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  <span>Open Timecode on YouTube</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Playable Native HTML5 MP4 Video Player with Poster */}
      <div className="flex-1 flex items-center justify-center my-2">
        <div
          className={`w-full bg-black rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center relative group ${
            isVertical ? 'aspect-[9/16] max-w-[260px] mx-auto' : 'aspect-video'
          }`}
        >
          {useIframeFallback && ytId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ytId}?start=${clip.startTime}&end=${clip.endTime}&autoplay=1`}
              title={`Part ${index + 1}`}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <>
              <video
                ref={videoRef}
                controls
                playsInline
                preload="none"
                poster={posterUrl}
                src={streamUrl}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onWaiting={() => setIsVideoLoading(true)}
                onPlaying={() => setIsVideoLoading(false)}
                onError={() => {
                  setIsVideoLoading(false);
                  // If native playback has issue on mobile, allow instant fallback
                  if (ytId) setUseIframeFallback(true);
                }}
                className="w-full h-full object-contain"
              >
                Your browser does not support the video tag.
              </video>

              {/* Play Overlay Button if video is paused */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={`Play Part ${index + 1}`}
                  className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/60 hover:bg-red-600/90 text-white flex items-center justify-center backdrop-blur-xs transition-all shadow-lg hover:scale-110 cursor-pointer pointer-events-auto"
                >
                  {isVideoLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  ) : (
                    <Play className="w-6 h-6 fill-white ml-0.5" />
                  )}
                </button>
              )}
            </>
          )}
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
        <button
          type="button"
          onClick={handleDownloadPart}
          disabled={isDownloading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-60"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Rendering Part {index + 1}...</span>
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
