import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize2, ShieldAlert } from 'lucide-react';
import { VideoMetadata, ClipSegment } from '../types/trimmer';
import { formatTimestamp, extractYouTubeId } from '../utils/trimmerLogic';

interface VideoPlayerViewProps {
  metadata: VideoMetadata;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  activeClip: ClipSegment | null;
  videoElementRef: React.RefObject<HTMLVideoElement | null>;
  onDurationDetected?: (duration: number) => void;
}

export const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({
  metadata,
  currentTime,
  onTimeUpdate,
  activeClip,
  videoElementRef,
  onDurationDetected,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoopingClip, setIsLoopingClip] = useState(false);
  const ytIframeRef = useRef<HTMLIFrameElement>(null);

  const youtubeId = metadata.type === 'youtube' ? extractYouTubeId(metadata.url) : null;

  // Handle HTML5 video playback
  useEffect(() => {
    const video = videoElementRef.current;
    if (!video) return;

    const handleTime = () => {
      onTimeUpdate(video.currentTime);

      // If playing an active clip and loop is on
      if (activeClip) {
        if (video.currentTime >= activeClip.endTime) {
          if (isLoopingClip) {
            video.currentTime = activeClip.startTime;
          } else {
            video.pause();
            setIsPlaying(false);
          }
        }
      }
    };

    const handleLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration)) {
        onDurationDetected?.(video.duration);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTime);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTime);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoElementRef, activeClip, isLoopingClip, onTimeUpdate, onDurationDetected]);

  // Controls for HTML5 video
  const togglePlay = () => {
    const video = videoElementRef.current;
    if (!video) return;

    if (video.paused) {
      // If we are at or past the clip end, restart at clip start
      if (activeClip && (video.currentTime >= activeClip.endTime || video.currentTime < activeClip.startTime)) {
        video.currentTime = activeClip.startTime;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const seekRelative = (seconds: number) => {
    const video = videoElementRef.current;
    if (video) {
      video.currentTime = Math.max(0, Math.min(video.duration || metadata.duration, video.currentTime + seconds));
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    const video = videoElementRef.current;
    if (video) video.playbackRate = rate;
  };

  const toggleMute = () => {
    const video = videoElementRef.current;
    if (video) {
      video.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
      {/* Video Display Area */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
        {metadata.type === 'youtube' && youtubeId ? (
          <div className="w-full h-full relative">
            <iframe
              ref={ytIframeRef}
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=0&enablejsapi=1&rel=0`}
              title={metadata.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            {/* Active clip notification banner if a clip is selected */}
            {activeClip && (
              <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-700/80 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 pointer-events-none">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: activeClip.color || '#3b82f6' }}
                />
                <span className="font-medium">{activeClip.title}</span>
                <span className="text-slate-400">
                  ({formatTimestamp(activeClip.startTime)} - {formatTimestamp(activeClip.endTime)})
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full relative flex items-center justify-center">
            <video
              ref={videoElementRef}
              src={metadata.url}
              className="w-full h-full object-contain"
              playsInline
              crossOrigin="anonymous"
              onClick={togglePlay}
            />

            {/* In-video active clip badge */}
            {activeClip && (
              <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur border border-slate-700 text-white text-xs px-3 py-1.5 rounded-lg shadow-md flex items-center gap-2 pointer-events-none">
                <span
                  className="w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{ backgroundColor: activeClip.color || '#ef4444' }}
                />
                <span className="font-semibold text-slate-100">{activeClip.title}</span>
                <span className="text-slate-400">
                  {formatTimestamp(activeClip.startTime)} - {formatTimestamp(activeClip.endTime)}
                </span>
              </div>
            )}

            {/* Big center play icon when paused */}
            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute w-16 h-16 rounded-full bg-red-600/90 hover:bg-red-500 text-white flex items-center justify-center shadow-xl transition-transform hover:scale-110 cursor-pointer"
                aria-label="Play video"
              >
                <Play className="w-8 h-8 translate-x-0.5 fill-white" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Controller bar for HTML5 / Native videos */}
      {metadata.type !== 'youtube' && (
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Play/Pause & Step Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors cursor-pointer"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
            </button>

            <button
              onClick={() => seekRelative(-5)}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
              title="Jump -5 seconds"
              aria-label="Jump backward 5 seconds"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => seekRelative(5)}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
              title="Jump +5 seconds"
              aria-label="Jump forward 5 seconds"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <div className="font-mono text-slate-200 ml-2">
              <span className="text-white font-semibold">{formatTimestamp(currentTime, true)}</span>
              <span className="text-slate-500"> / {formatTimestamp(metadata.duration)}</span>
            </div>
          </div>

          {/* Speed, Loop, Volume */}
          <div className="flex items-center gap-2">
            {activeClip && (
              <button
                onClick={() => setIsLoopingClip(!isLoopingClip)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  isLoopingClip
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Loop current clip"
              >
                Loop Clip {isLoopingClip ? 'ON' : 'OFF'}
              </button>
            )}

            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              {[0.5, 1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleSpeedChange(rate)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    playbackRate === rate
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            <button
              onClick={toggleMute}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Video Details Header below player */}
      <div className="p-4 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between">
        <div className="min-w-0 pr-4">
          <h3 className="text-sm font-semibold text-slate-100 truncate">
            {metadata.title}
          </h3>
          <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
            {metadata.author && <span>{metadata.author}</span>}
            <span aria-hidden="true">·</span>
            <span>Duration: {formatTimestamp(metadata.duration)}</span>
            <span aria-hidden="true">·</span>
            <span className="uppercase text-[10px] tracking-wider text-slate-500">
              {metadata.type}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
