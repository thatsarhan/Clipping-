import React, { useState } from 'react';
import {
  Scissors,
  Youtube,
  Upload,
  PlayCircle,
  Sliders,
  Sparkles,
  Smartphone,
  Film,
  ShieldCheck,
  Check,
  ArrowRight,
  Clock,
  Link2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { PlatformFormat, VideoQuality, VideoMetadata } from '../types/trimmer';
import { PLATFORM_CONFIGS, QUALITY_CONFIGS } from '../data/platforms';
import { SAMPLE_VIDEOS, POPULAR_YOUTUBE_PRESETS } from '../data/sampleVideos';
import { extractYouTubeId, formatTimestamp } from '../utils/trimmerLogic';

interface SetupWizardViewProps {
  onProceed: (config: {
    videoSource: { type: 'youtube' | 'file' | 'sample'; urlOrFile: string | File; meta?: Partial<VideoMetadata> };
    platform: PlatformFormat;
    quality: VideoQuality;
    sliceSeconds: number;
  }) => void;
  isLoading: boolean;
}

export const SetupWizardView: React.FC<SetupWizardViewProps> = ({
  onProceed,
  isLoading,
}) => {
  // Step 1: Input source
  const [sourceType, setSourceType] = useState<'youtube' | 'sample' | 'upload'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_VIDEOS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 2: Platform
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFormat>('shorts'); // Default to Shorts per user emphasis!

  // Step 3: Quality
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('4k'); // Default to 4K requested!

  // Step 4: Duration per video
  const [sliceSeconds, setSliceSeconds] = useState<number>(30); // 30s default for Shorts!
  const [totalEstimatedDuration, setTotalEstimatedDuration] = useState<number>(600); // 10 min benchmark

  // Handle paste button
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setYoutubeUrl(text);
        setErrorMsg(null);
      }
    } catch {}
  };

  // Live part count calculation
  const numParts = Math.floor(totalEstimatedDuration / Math.max(1, sliceSeconds));
  const remainder = totalEstimatedDuration % Math.max(1, sliceSeconds);
  const totalParts = numParts + (remainder > 1 ? 1 : 0);

  const handleStartProcess = () => {
    setErrorMsg(null);

    if (sourceType === 'youtube') {
      if (!youtubeUrl.trim()) {
        setErrorMsg('Please paste a YouTube video link');
        return;
      }
      const vidId = extractYouTubeId(youtubeUrl);
      if (!vidId) {
        setErrorMsg('Please enter a valid YouTube URL (e.g. youtube.com/watch?v=... or youtu.be/...)');
        return;
      }

      onProceed({
        videoSource: {
          type: 'youtube',
          urlOrFile: youtubeUrl.trim(),
          meta: {
            id: vidId,
            title: `YouTube Video (${vidId})`,
            duration: totalEstimatedDuration,
            thumbnailUrl: `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
            aspectRatio: selectedPlatform === 'shorts' || selectedPlatform === 'tiktok' ? '9:16' : '16:9',
            is4K: selectedQuality === '4k',
          },
        },
        platform: selectedPlatform,
        quality: selectedQuality,
        sliceSeconds,
      });
    } else if (sourceType === 'sample') {
      const sample = SAMPLE_VIDEOS.find((s) => s.id === selectedSampleId) || SAMPLE_VIDEOS[0];
      onProceed({
        videoSource: {
          type: 'sample',
          urlOrFile: sample.url,
          meta: {
            ...sample,
            is4K: selectedQuality === '4k',
          },
        },
        platform: selectedPlatform,
        quality: selectedQuality,
        sliceSeconds,
      });
    } else if (sourceType === 'upload') {
      if (!uploadedFile) {
        setErrorMsg('Please choose a video file from your computer');
        return;
      }
      onProceed({
        videoSource: {
          type: 'file',
          urlOrFile: uploadedFile,
          meta: {
            title: uploadedFile.name.replace(/\.[^/.]+$/, ''),
            duration: totalEstimatedDuration,
            is4K: selectedQuality === '4k',
          },
        },
        platform: selectedPlatform,
        quality: selectedQuality,
        sliceSeconds,
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Hero Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 via-rose-500 to-amber-500 text-white shadow-xl shadow-red-500/25 mb-2">
          <Scissors className="w-7 h-7 -rotate-45" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          ClipCraft 4K Video Slicer
        </h1>
        <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
          Input any video or YouTube link, customize duration and platform, and download your trimmed 4K parts with individual download buttons.
        </p>
      </div>

      {/* Main Wizard Form Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-7">
        {/* STEP 1: Video Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <span>Step 1</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-200">Select Video Source</span>
            </span>

            {/* Input Mode Selector */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setSourceType('youtube')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  sourceType === 'youtube'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                YouTube Link
              </button>
              <button
                type="button"
                onClick={() => setSourceType('sample')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  sourceType === 'sample'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Demo Videos
              </button>
              <button
                type="button"
                onClick={() => setSourceType('upload')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  sourceType === 'upload'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Upload File
              </button>
            </div>
          </div>

          {/* Mode 1: YouTube URL */}
          {sourceType === 'youtube' && (
            <div className="space-y-2.5">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Youtube className="w-5 h-5 text-red-500" />
                </div>
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => {
                    setYoutubeUrl(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Paste YouTube link (e.g. https://www.youtube.com/watch?v=...)"
                  className="w-full pl-11 pr-24 py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all font-mono"
                  aria-label="YouTube video URL"
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  className="absolute inset-y-2 right-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Paste
                </button>
              </div>

              {/* Quick Preset Links */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 pt-1">
                <span className="text-slate-500 text-[11px]">Quick Samples:</span>
                {POPULAR_YOUTUBE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setYoutubeUrl(p.url);
                      setTotalEstimatedDuration(p.duration);
                    }}
                    className="px-2.5 py-1 rounded-md bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode 2: Sample Library */}
          {sourceType === 'sample' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SAMPLE_VIDEOS.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedSampleId(s.id);
                    setTotalEstimatedDuration(s.duration);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedSampleId === s.id
                      ? 'bg-slate-950 border-red-500 ring-1 ring-red-500/40 shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <img
                    src={s.thumbnailUrl}
                    alt={s.title}
                    className="w-full aspect-video rounded-lg object-cover mb-2"
                  />
                  <h4 className="text-xs font-semibold text-white line-clamp-1">{s.title}</h4>
                  <p className="text-[11px] text-slate-400">{Math.floor(s.duration / 60)} minutes · 4K</p>
                </div>
              ))}
            </div>
          )}

          {/* Mode 3: Local File Upload */}
          {sourceType === 'upload' && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/60 rounded-2xl p-6 cursor-pointer transition-colors">
              <Upload className="w-8 h-8 text-red-400 mb-2" />
              <span className="text-sm font-medium text-slate-200">
                {uploadedFile ? uploadedFile.name : 'Choose a video from your computer'}
              </span>
              <span className="text-xs text-slate-500 mt-1">MP4, WebM, MOV, MKV (Supports 4K UHD)</span>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setUploadedFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
            </label>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 text-rose-400 text-xs mt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* STEP 2: Format & Aspect Ratio */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
            <span>Step 2</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-200">Social Format &amp; Aspect Ratio</span>
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {Object.values(PLATFORM_CONFIGS).map((platform) => {
              const isSelected = selectedPlatform === platform.id;
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlatform(platform.id as PlatformFormat);
                    if (platform.idealDurationSeconds) {
                      setSliceSeconds(platform.idealDurationSeconds);
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800 border-red-500 ring-1 ring-red-500/50 shadow-md'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
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
                    <span>{platform.idealDurationSeconds}s</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 3: Quality / Resolution */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <span>Step 3</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-200">Export Resolution</span>
            </span>
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>4K High-Quality Preservation</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(['4k', '2k', '1080p', '720p'] as VideoQuality[]).map((q) => {
              const cfg = QUALITY_CONFIGS[q];
              const isSelected = selectedQuality === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setSelectedQuality(q)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800 border-red-500 ring-1 ring-red-500/50 shadow-md'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white uppercase">{q}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400">{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 4: Duration per Video (Slider & Calculation) */}
        <div className="space-y-4 pt-4 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <span>Step 4</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-200">How many seconds per video?</span>
            </span>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { label: '30s (Shorts)', sec: 30 },
                { label: '60s (TikTok)', sec: 60 },
                { label: '2 min (120s)', sec: 120 },
                { label: '5 min (300s)', sec: 300 },
                { label: '7 min (420s)', sec: 420 },
              ].map((p) => (
                <button
                  key={p.sec}
                  type="button"
                  onClick={() => setSliceSeconds(p.sec)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    sliceSeconds === p.sec
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Range Slider */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Each Part Duration:</span>
              </span>
              <span className="font-mono text-base font-bold text-white bg-slate-900 px-3 py-0.5 rounded-lg border border-slate-800">
                {formatTimestamp(sliceSeconds)} ({sliceSeconds}s)
              </span>
            </div>

            <input
              type="range"
              min={10}
              max={600}
              step={5}
              value={sliceSeconds}
              onChange={(e) => setSliceSeconds(Number(e.target.value))}
              className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400"
              aria-label="Duration per video slider"
            />

            {/* Live calculation banner */}
            <div className="flex items-center gap-2 text-xs text-slate-400 pt-1 border-t border-slate-800/80">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>
                Yields <strong className="text-white">{numParts}</strong> part{numParts > 1 ? 's' : ''} of{' '}
                <strong className="text-white">{formatTimestamp(sliceSeconds)}</strong>
                {remainder > 1 && (
                  <>
                    {' '}
                    + 1 final part of <strong className="text-amber-400">{formatTimestamp(remainder)}</strong>
                  </>
                )}
                {' '}— <strong className="text-emerald-400">{totalParts} individual download buttons ready</strong>
              </span>
            </div>
          </div>
        </div>

        {/* PROCEED PRIMARY CTA */}
        <div className="pt-4">
          <button
            type="button"
            onClick={handleStartProcess}
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 active:scale-[0.99] text-white font-bold text-base rounded-2xl shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            <span>{isLoading ? 'Processing Video...' : 'Proceed to Process & Slice Video'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
