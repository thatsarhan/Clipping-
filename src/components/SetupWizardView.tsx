import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Youtube,
  Upload,
  PlayCircle,
  Smartphone,
  Film,
  Square,
  Maximize2,
  ShieldCheck,
  Check,
  ArrowRight,
  Clock,
  AlertCircle,
  Info,
  Download,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { PlatformFormat, VideoQuality, VideoMetadata, OutputOrientation } from '../types/trimmer';
import { SAMPLE_VIDEOS, POPULAR_YOUTUBE_PRESETS } from '../data/sampleVideos';
import { extractYouTubeId, formatTimestamp, calculateClipCount, generateEqualSegments } from '../utils/trimmerLogic';

interface SetupWizardViewProps {
  onProceed: (config: {
    videoSource: { type: 'youtube' | 'file' | 'sample'; urlOrFile: string | File; meta?: Partial<VideoMetadata> };
    orientation: OutputOrientation;
    platform: PlatformFormat;
    quality: VideoQuality;
    sliceSeconds: number;
  }) => void;
  isLoading: boolean;
  activeSourceTab?: 'youtube' | 'sample' | 'upload';
  onTabChange?: (tab: 'youtube' | 'sample' | 'upload') => void;
}

const DURATION_PRESETS = [
  { label: '10s', sec: 10, hint: 'Quick teaser' },
  { label: '15s', sec: 15, hint: 'Stories / Reels' },
  { label: '30s', sec: 30, hint: 'Shorts standard' },
  { label: '45s', sec: 45, hint: 'Extended short' },
  { label: '60s', sec: 60, hint: '1-minute clip' },
];

const ORIENTATION_OPTIONS: { id: OutputOrientation; name: string; ratio: string; icon: any; desc: string }[] = [
  { id: 'original', name: 'Original', ratio: 'Native', icon: Maximize2, desc: 'Keep source aspect ratio' },
  { id: '9:16', name: 'Vertical', ratio: '9:16', icon: Smartphone, desc: 'YouTube Shorts, TikTok, Reels' },
  { id: '16:9', name: 'Landscape', ratio: '16:9', icon: Film, desc: 'Standard YouTube & TV' },
  { id: '1:1', name: 'Square', ratio: '1:1', icon: Square, desc: 'Instagram feed & LinkedIn' },
];

export const SetupWizardView: React.FC<SetupWizardViewProps> = ({
  onProceed,
  isLoading,
  activeSourceTab,
  onTabChange,
}) => {
  // Step 1: Input source
  const [internalSourceType, setInternalSourceType] = useState<'youtube' | 'sample' | 'upload'>('youtube');
  const sourceType = activeSourceTab || internalSourceType;
  const setSourceType = (tab: 'youtube' | 'sample' | 'upload') => {
    setInternalSourceType(tab);
    onTabChange?.(tab);
  };

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_VIDEOS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Metadata retrieval for YouTube links
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [detectedMeta, setDetectedMeta] = useState<{ title?: string; duration?: number; thumbnailUrl?: string } | null>(null);

  // Step 2: Duration per clip
  const [sliceSeconds, setSliceSeconds] = useState<number>(30);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customInputStr, setCustomInputStr] = useState('30');

  // Step 3: Aspect Ratio / Orientation
  const [selectedOrientation, setSelectedOrientation] = useState<OutputOrientation>('9:16');

  // Step 4: Resolution / Quality
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('4k');

  // Estimated or probed total video duration (default 10 min benchmark = 600s)
  const [totalEstimatedDuration, setTotalEstimatedDuration] = useState<number>(600);

  // When YouTube URL changes, attempt quick info fetch
  useEffect(() => {
    const vidId = extractYouTubeId(youtubeUrl);
    if (!vidId) {
      setDetectedMeta(null);
      return;
    }

    const timer = setTimeout(async () => {
      setFetchingMeta(true);
      try {
        const res = await fetch(`/api/video-info?url=${encodeURIComponent(youtubeUrl)}`);
        if (res.ok) {
          const data = await res.json();
          setDetectedMeta({
            title: data.title,
            duration: data.duration,
            thumbnailUrl: data.thumbnailUrl,
          });
          if (data.duration && data.duration > 0) {
            setTotalEstimatedDuration(data.duration);
          }
        }
      } catch {
        // Fallback to defaults
      } finally {
        setFetchingMeta(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [youtubeUrl]);

  // When sample changes
  useEffect(() => {
    if (sourceType === 'sample') {
      const sample = SAMPLE_VIDEOS.find((s) => s.id === selectedSampleId);
      if (sample) {
        setTotalEstimatedDuration(sample.duration);
      }
    }
  }, [sourceType, selectedSampleId]);

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

  // Select duration preset
  const handleSelectPreset = (sec: number) => {
    setSliceSeconds(sec);
    setCustomInputStr(sec.toString());
    setIsCustomDuration(false);
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomInputStr(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setSliceSeconds(Math.min(3600, Math.max(1, parsed)));
    }
  };

  // Exact math: ceil(totalDuration / sliceSeconds)
  const safeSlice = Math.max(1, sliceSeconds);
  const totalClips = calculateClipCount(totalEstimatedDuration, safeSlice);
  const fullClips = Math.floor(totalEstimatedDuration / safeSlice);
  const remainderSec = totalEstimatedDuration % safeSlice;

  // Segment preview list
  const previewSegments = generateEqualSegments(totalEstimatedDuration, safeSlice, {
    maxSegments: 50,
  });

  const handleStartProcess = () => {
    setErrorMsg(null);

    const platformFormat: PlatformFormat =
      selectedOrientation === '9:16' ? 'shorts' : selectedOrientation === '1:1' ? 'instagram' : 'youtube';

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
            title: detectedMeta?.title || `YouTube Video (${vidId})`,
            duration: totalEstimatedDuration,
            thumbnailUrl: detectedMeta?.thumbnailUrl || `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
            aspectRatio: selectedOrientation === '9:16' ? '9:16' : selectedOrientation === '1:1' ? '1:1' : '16:9',
            is4K: selectedQuality === '4k',
          },
        },
        orientation: selectedOrientation,
        platform: platformFormat,
        quality: selectedQuality,
        sliceSeconds: safeSlice,
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
        orientation: selectedOrientation,
        platform: platformFormat,
        quality: selectedQuality,
        sliceSeconds: safeSlice,
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
        orientation: selectedOrientation,
        platform: platformFormat,
        quality: selectedQuality,
        sliceSeconds: safeSlice,
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Hero Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 via-rose-500 to-amber-500 text-white shadow-xl shadow-red-500/25 mb-1">
          <Scissors className="w-7 h-7 -rotate-45" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          YouTube Video Clip Generator
        </h1>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Paste a YouTube link or upload a video, select your clip duration, and slice into consecutive, gap-free video clips ready for individual and bulk download.
        </p>
      </div>

      {/* Main Configuration Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-7">
        {/* STEP 1: Video Source */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <span>Step 1</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-200">Paste YouTube Link or Upload</span>
            </span>

            {/* Source Tab Toggle */}
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
                YouTube URL
              </button>
              <button
                type="button"
                onClick={() => setSourceType('upload')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  sourceType === 'upload'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Direct Upload
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
            </div>
          </div>

          {/* Mode 1: YouTube URL */}
          {sourceType === 'youtube' && (
            <div className="space-y-3">
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
                  className="absolute inset-y-2 right-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Paste
                </button>
              </div>

              {/* Detected Metadata preview card if recognized */}
              {detectedMeta && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                  {detectedMeta.thumbnailUrl && (
                    <img
                      src={detectedMeta.thumbnailUrl}
                      alt="Thumbnail"
                      className="w-16 h-10 object-cover rounded-lg border border-slate-800"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{detectedMeta.title}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Duration: {formatTimestamp(detectedMeta.duration || totalEstimatedDuration)} · Verified
                    </p>
                  </div>
                </div>
              )}

              {/* Preset Quick Links */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
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

              {/* YouTube Cloud IP Guidance & Direct Device Download Helper */}
              {extractYouTubeId(youtubeUrl) && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Info className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>YouTube link validated. Slicing with FFmpeg backend.</span>
                  </div>
                  <a
                    href={`https://ssyoutube.com/watch?v=${extractYouTubeId(youtubeUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-red-400" />
                    <span>Download Video to Device (Optional backup)</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Direct Upload */}
          {sourceType === 'upload' && (
            <div className="space-y-3">
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files?.[0]) {
                    const f = e.dataTransfer.files[0];
                    setUploadedFile(f);
                    setErrorMsg(null);
                  }
                }}
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-7 cursor-pointer transition-all ${
                  uploadedFile
                    ? 'border-emerald-500/80 bg-emerald-950/20 shadow-lg'
                    : 'border-slate-800 hover:border-emerald-500/60 bg-slate-950/80'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                  uploadedFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-slate-100 text-center">
                  {uploadedFile ? uploadedFile.name : 'Choose or Drag & Drop a video file here'}
                </span>
                {uploadedFile ? (
                  <span className="text-xs text-emerald-400 font-mono mt-1 font-semibold">
                    {(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB ready for 100% genuine FFmpeg slicing
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 mt-1">
                    MP4, WebM, MOV supported (Instant server processing, no bot checks)
                  </span>
                )}
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setUploadedFile(e.target.files[0]);
                      setErrorMsg(null);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Mode 3: Demo Videos */}
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
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-800/80 mb-2 relative flex items-center justify-center">
                    <img
                      src={s.thumbnailUrl}
                      alt={s.title}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="w-full h-full object-cover relative z-10"
                    />
                    <PlayCircle className="w-8 h-8 text-slate-700 absolute inset-0 m-auto" />
                  </div>
                  <h4 className="text-xs font-semibold text-white line-clamp-1">{s.title}</h4>
                  <p className="text-[11px] text-slate-400">{Math.floor(s.duration / 60)} minutes · 4K</p>
                </div>
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 text-rose-400 text-xs mt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* STEP 2: Choose Clip Duration (10s, 15s, 30s, 45s, 60s, Custom) */}
        <div className="space-y-4 pt-4 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <span>Step 2</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-200">Choose Clip Duration</span>
            </span>

            <span className="text-xs font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
              {sliceSeconds}s per clip
            </span>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {DURATION_PRESETS.map((p) => {
              const isSelected = !isCustomDuration && sliceSeconds === p.sec;
              return (
                <button
                  key={p.sec}
                  type="button"
                  onClick={() => handleSelectPreset(p.sec)}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                    isSelected
                      ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-600/30'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span className="text-sm font-bold">{p.label}</span>
                  <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-red-100' : 'text-slate-500'}`}>
                    {p.hint}
                  </span>
                </button>
              );
            })}

            {/* Custom Duration Button & Input */}
            <button
              type="button"
              onClick={() => setIsCustomDuration(true)}
              className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                isCustomDuration
                  ? 'bg-slate-800 border-red-500 text-white ring-1 ring-red-500/50'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
            >
              <span className="text-sm font-bold">Custom</span>
              <span className="text-[10px] text-slate-500 mt-0.5">Specify secs</span>
            </button>
          </div>

          {/* Custom seconds input field if Custom is active */}
          {isCustomDuration && (
            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Custom Duration:</span>
              <input
                type="number"
                min={5}
                max={3600}
                value={customInputStr}
                onChange={handleCustomInputChange}
                className="w-24 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm text-center focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <span className="text-xs text-slate-400">seconds (e.g. 20, 75, 120)</span>
            </div>
          )}

          {/* Slider for fine adjustment */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Fine-tune segment length:</span>
              </span>
              <span className="font-mono text-white font-bold bg-slate-900 px-2.5 py-0.5 rounded border border-slate-800">
                {formatTimestamp(sliceSeconds)} ({sliceSeconds}s)
              </span>
            </div>

            <input
              type="range"
              min={5}
              max={Math.min(600, totalEstimatedDuration)}
              step={5}
              value={sliceSeconds}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSliceSeconds(val);
                setCustomInputStr(val.toString());
              }}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400"
              aria-label="Clip duration slider"
            />
          </div>
        </div>

        {/* STEP 3: Aspect Ratio / Orientation */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
            <span>Step 3</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-200">Video Orientation &amp; Aspect Ratio</span>
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ORIENTATION_OPTIONS.map((opt) => {
              const isSelected = selectedOrientation === opt.id;
              const IconComp = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedOrientation(opt.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800 border-red-500 ring-1 ring-red-500/50 shadow-md'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <IconComp className="w-4 h-4 text-red-400" />
                      {opt.name}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400">{opt.desc}</span>
                  <span className="text-[10px] font-mono text-slate-500 mt-1 font-semibold">{opt.ratio}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 4: Export Resolution */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <span>Step 4</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-200">Resolution &amp; Quality</span>
            </span>
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>High Quality Encoding</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { id: '4k', label: '4K Ultra HD (2160p)', desc: 'Max fidelity' },
              { id: '2k', label: '2K Quad HD (1440p)', desc: 'Crisp & light' },
              { id: '1080p', label: '1080p Full HD', desc: 'Standard HD' },
              { id: '720p', label: '720p Fast Export', desc: 'Fastest download' },
            ].map((q) => {
              const isSelected = selectedQuality === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedQuality(q.id as VideoQuality)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800 border-red-500 ring-1 ring-red-500/50 shadow-md'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white uppercase">{q.id}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400">{q.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* LIVE SEGMENT BREAKDOWN & VISUAL TIMELINE STRIP */}
        <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Consecutive Segmentation Breakdown</span>
            </span>
            <span className="text-xs font-mono text-emerald-400 font-bold">
              {totalClips} Total Clips Generated
            </span>
          </div>

          {/* Mathematical Explanation */}
          <div className="text-xs text-slate-300 leading-relaxed">
            {remainderSec === 0 ? (
              <span>
                Source video duration <strong className="text-white">{formatTimestamp(totalEstimatedDuration)}</strong> divides evenly into{' '}
                <strong className="text-emerald-400">{totalClips} clips</strong> of <strong className="text-white">{sliceSeconds}s</strong> each (00:00 to {formatTimestamp(totalEstimatedDuration)}).
              </span>
            ) : (
              <span>
                Source video duration <strong className="text-white">{formatTimestamp(totalEstimatedDuration)}</strong> yields{' '}
                <strong className="text-emerald-400">{fullClips} full clips</strong> of <strong className="text-white">{sliceSeconds}s</strong>{' '}
                + <strong className="text-amber-400">1 final clip</strong> of <strong className="text-amber-400">{remainderSec}s</strong>{' '}
                ({formatTimestamp(fullClips * safeSlice)} to {formatTimestamp(totalEstimatedDuration)}). No footage is discarded.
              </span>
            )}
          </div>

          {/* Visual Mini Timeline Bar showing consecutive segments */}
          <div className="space-y-1.5 pt-1">
            <div className="w-full h-4 bg-slate-900 rounded-md overflow-hidden flex border border-slate-800">
              {previewSegments.slice(0, 30).map((seg, idx) => (
                <div
                  key={seg.id}
                  style={{
                    width: `${(seg.duration / totalEstimatedDuration) * 100}%`,
                    backgroundColor: seg.color || '#3B82F6',
                  }}
                  className="h-full border-r border-slate-950/60 opacity-80 hover:opacity-100 transition-opacity"
                  title={`${seg.title}: ${formatTimestamp(seg.startTime)} – ${formatTimestamp(seg.endTime)}`}
                />
              ))}
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>00:00 (Start)</span>
              <span>{totalClips} Consecutive Clips</span>
              <span>{formatTimestamp(totalEstimatedDuration)} (End)</span>
            </div>
          </div>
        </div>

        {/* PRIMARY PROCEED CTA */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleStartProcess}
            disabled={isLoading || fetchingMeta}
            className="w-full py-4 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 active:scale-[0.99] text-white font-bold text-base rounded-2xl shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            <span>{isLoading ? 'Submitting Video Job...' : `Generate ${totalClips} Consecutive Clips`}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
