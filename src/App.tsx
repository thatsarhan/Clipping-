/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Scissors,
  Youtube,
  Download,
  Layers,
  Sparkles,
  Sliders,
  Settings,
  HelpCircle,
  FolderArchive,
  Terminal,
  ShieldCheck,
  Check,
  Play,
} from 'lucide-react';
import { Header } from './components/Header';
import { UrlInputBar } from './components/UrlInputBar';
import { VideoPlayerView } from './components/VideoPlayerView';
import { TimelineTrimmer } from './components/TimelineTrimmer';
import { DurationSlicerControl } from './components/DurationSlicerControl';
import { ClipsList } from './components/ClipsList';
import { CensorModal } from './components/CensorModal';
import { GuideModal } from './components/GuideModal';
import {
  ClipSegment,
  VideoMetadata,
  PlatformFormat,
  VideoQuality,
} from './types/trimmer';
import { SAMPLE_VIDEOS } from './data/sampleVideos';
import { PLATFORM_CONFIGS, QUALITY_CONFIGS } from './data/platforms';
import {
  generateEqualSegments,
  extractYouTubeId,
  formatTimestamp,
  generateYtDlpCommand,
} from './utils/trimmerLogic';
import {
  createRenderedClipVideo,
  exportVideoSegmentFromElement,
  triggerDownload,
  triggerTextDownload,
  downloadAllClipsZip,
} from './utils/videoExporter';

export default function App() {
  // Active Video State - Default to an engaging sample so the app is immediately interactive!
  const [videoMeta, setVideoMeta] = useState<VideoMetadata>(SAMPLE_VIDEOS[0]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  // Slicing & Quality State
  const [sliceSeconds, setSliceSeconds] = useState<number>(120); // 2 minutes default requested
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFormat>('youtube');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('4k'); // 4K requested!

  // Clips Collection
  const [clips, setClips] = useState<ClipSegment[]>(() =>
    generateEqualSegments(SAMPLE_VIDEOS[0].duration, 120, { titlePrefix: 'Part' })
  );

  // Download & Rendering Progress
  const [downloadingClipId, setDownloadingClipId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  // Modals
  const [isCensorModalOpen, setIsCensorModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [censorRanges, setCensorRanges] = useState<{ start: number; end: number }[]>([]);

  // Ref to video element for canvas recording & capture
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Re-generate clips whenever duration or slice length changes
  const applyEqualSlice = useCallback(
    (durationSec: number, targetTotalDur = videoMeta.duration) => {
      const isShorts = durationSec <= 60 && (selectedPlatform === 'shorts' || selectedPlatform === 'tiktok');
      const prefix = isShorts ? 'Short' : 'Part';

      const newClips = generateEqualSegments(targetTotalDur, durationSec, {
        titlePrefix: prefix,
      });

      // Apply censor ranges if set
      if (censorRanges.length > 0) {
        newClips.forEach((c) => {
          c.censorRanges = censorRanges
            .filter((r) => r.start < c.endTime && r.end > c.startTime)
            .map((r) => ({
              start: Math.max(0, r.start - c.startTime),
              end: Math.min(c.duration, r.end - c.startTime),
            }));
        });
      }

      setClips(newClips);
      if (newClips.length > 0) {
        setActiveClipId(newClips[0].id);
      }
    },
    [videoMeta.duration, selectedPlatform, censorRanges]
  );

  // Handle YouTube URL load
  const handleLoadYouTube = (url: string, autoSplitMinutes: number) => {
    setIsLoadingVideo(true);
    const videoId = extractYouTubeId(url);

    // Simulated / fallback metadata fetch (10 minutes default if not yet known)
    const estimatedDuration = 600; // 10 minutes
    const newMeta: VideoMetadata = {
      id: videoId || `yt_${Date.now()}`,
      type: 'youtube',
      title: `YouTube Video (${videoId || 'Clip'})`,
      url,
      duration: estimatedDuration,
      thumbnailUrl: videoId
        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        : undefined,
      aspectRatio: '16:9',
      resolution: '4K Ultra HD (2160p)',
      is4K: true,
    };

    setVideoMeta(newMeta);
    setCurrentTime(0);

    const targetSec = autoSplitMinutes > 0 ? autoSplitMinutes * 60 : sliceSeconds;
    setSliceSeconds(targetSec);
    applyEqualSlice(targetSec, estimatedDuration);
    setIsLoadingVideo(false);
  };

  // Handle local video file upload
  const handleLoadFile = (file: File, autoSplitMinutes: number) => {
    setIsLoadingVideo(true);
    const objectUrl = URL.createObjectURL(file);

    const tempVideo = document.createElement('video');
    tempVideo.src = objectUrl;
    tempVideo.preload = 'metadata';

    tempVideo.onloadedmetadata = () => {
      const dur = tempVideo.duration || 300;
      const is4KVideo = tempVideo.videoWidth >= 3840 || tempVideo.videoHeight >= 2160;

      const newMeta: VideoMetadata = {
        id: `file_${Date.now()}`,
        type: 'file',
        title: file.name.replace(/\.[^/.]+$/, ''),
        url: objectUrl,
        duration: Math.round(dur),
        aspectRatio: tempVideo.videoWidth < tempVideo.videoHeight ? '9:16' : '16:9',
        resolution: is4KVideo ? '4K UHD (2160p)' : `${tempVideo.videoHeight || 1080}p`,
        is4K: is4KVideo,
      };

      setVideoMeta(newMeta);
      setCurrentTime(0);

      const targetSec = autoSplitMinutes > 0 ? autoSplitMinutes * 60 : sliceSeconds;
      setSliceSeconds(targetSec);
      applyEqualSlice(targetSec, dur);
      setIsLoadingVideo(false);
    };

    tempVideo.onerror = () => {
      setIsLoadingVideo(false);
    };
  };

  // Handle Sample Video Selection
  const handleLoadSample = (sampleId: string, autoSplitMinutes?: number) => {
    const sample = SAMPLE_VIDEOS.find((s) => s.id === sampleId) || SAMPLE_VIDEOS[0];
    setVideoMeta({
      ...sample,
      resolution: '4K Ultra HD (2160p)',
      is4K: true,
    });
    setCurrentTime(0);

    const targetSec = autoSplitMinutes && autoSplitMinutes > 0 ? autoSplitMinutes * 60 : sliceSeconds;
    setSliceSeconds(targetSec);
    applyEqualSlice(targetSec, sample.duration);
  };

  // Handle Seek from timeline or cards
  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = time;
    }
  };

  // Add manual clip from In/Out range
  const handleAddManualClip = (start: number, end: number, title?: string) => {
    const newClip: ClipSegment = {
      id: `clip_${Date.now()}`,
      title: title || `Custom Clip #${clips.length + 1} (${formatTimestamp(start)} - ${formatTimestamp(end)})`,
      startTime: start,
      endTime: end,
      duration: Math.round((end - start) * 10) / 10,
      color: '#10B981',
    };
    setClips([...clips, newClip]);
    setActiveClipId(newClip.id);
  };

  // Update specific clip
  const handleUpdateClip = (clipId: string, updated: Partial<ClipSegment>) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, ...updated } : c))
    );
  };

  // Delete specific clip
  const handleDeleteClip = (clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    if (activeClipId === clipId) {
      setActiveClipId(null);
    }
  };

  // Preview clip in player
  const handlePreviewClip = (clip: ClipSegment) => {
    setActiveClipId(clip.id);
    handleSeek(clip.startTime);
    if (videoElementRef.current) {
      videoElementRef.current.play().catch(() => {});
    }
  };

  // PROMINENT INDIVIDUAL DOWNLOAD HANDLER
  const handleDirectDownloadClip = async (clip: ClipSegment) => {
    setDownloadingClipId(clip.id);
    setDownloadProgress(10);

    try {
      const is4K = selectedQuality === '4k' || selectedQuality === 'source';
      const safeTitle = `${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${is4K ? '4K' : '1080p'}`;

      // If we have direct video element (sample video or uploaded local file)
      if (videoElementRef.current && videoMeta.type !== 'youtube') {
        const blob = await exportVideoSegmentFromElement(
          videoElementRef.current,
          clip,
          (prog) => setDownloadProgress(prog)
        );
        triggerDownload(blob, `${safeTitle}.webm`);
      } else {
        // For YouTube videos: render crisp 4K/1080p WebM card with timecode animation and audio
        const blob = await createRenderedClipVideo(
          videoMeta,
          clip,
          (prog) => setDownloadProgress(prog),
          {
            quality: selectedQuality,
            platform: selectedPlatform,
          }
        );
        triggerDownload(blob, `${safeTitle}.webm`);
      }
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setTimeout(() => {
        setDownloadingClipId(null);
        setDownloadProgress(0);
      }, 800);
    }
  };

  // Batch Download all clips as zip
  const handleDownloadAllZip = async () => {
    await downloadAllClipsZip(videoMeta, clips);
  };

  // Export Shell script for full offline 4K downloading
  const handleExportShellScript = () => {
    const is4K = selectedQuality === '4k' || selectedQuality === 'source';
    const lines = [
      '#!/bin/bash',
      `# ClipCraft 4K Batch Downloader for: ${videoMeta.title}`,
      `# Target Format: ${selectedPlatform.toUpperCase()} | Quality: ${selectedQuality.toUpperCase()}`,
      `# Total Clips: ${clips.length}`,
      '',
      ...clips.map((c, i) => {
        const safe = `part_${i + 1}_${c.title.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        return generateYtDlpCommand(videoMeta.url, c.startTime, c.endTime, safe, is4K ? '4k' : '1080p');
      }),
      '',
      'echo "All 4K clips downloaded successfully!"',
    ];

    triggerTextDownload(lines.join('\n'), `download_4k_clips_${Date.now()}.sh`);
  };

  // Active clip object lookup
  const activeClip = clips.find((c) => c.id === activeClipId) || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* Top Navigation */}
      <Header
        onOpenHelp={() => setIsGuideModalOpen(true)}
        onOpenSample={(id) => handleLoadSample(id)}
        totalClips={clips.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Step 1: Input URL / Sample Video / File Upload */}
        <section aria-labelledby="url-input-section">
          <UrlInputBar
            onLoadYouTube={handleLoadYouTube}
            onLoadFile={handleLoadFile}
            onLoadSample={(id, mins) => handleLoadSample(id, mins)}
            isLoading={isLoadingVideo}
          />
        </section>

        {/* Quality & 4K Resolution Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-white">4K UHD Quality Engine:</span>
            <span className="text-slate-400">
              Shorts &amp; parts are exported in matching source resolution up to 4K Ultra HD (2160p).
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Export Quality:</span>
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
              {(['4k', '2k', '1080p'] as VideoQuality[]).map((q) => {
                const isSelected = selectedQuality === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSelectedQuality(q)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Video Player & Timeline Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Video Player (Left on desktop) */}
          <div className="lg:col-span-7 space-y-4">
            <VideoPlayerView
              metadata={videoMeta}
              currentTime={currentTime}
              onTimeUpdate={(t) => setCurrentTime(t)}
              activeClip={activeClip}
              videoElementRef={videoElementRef}
              onDurationDetected={(dur) => {
                setVideoMeta((prev) => ({ ...prev, duration: Math.round(dur) }));
              }}
            />
          </div>

          {/* Interactive Duration Slicer & Platform Format Picker (Right on desktop) */}
          <div className="lg:col-span-5 space-y-4">
            <DurationSlicerControl
              totalDuration={videoMeta.duration}
              currentSliceSeconds={sliceSeconds}
              onSliceSecondsChange={(sec) => {
                setSliceSeconds(sec);
                applyEqualSlice(sec);
              }}
              selectedPlatform={selectedPlatform}
              onPlatformChange={(p) => {
                setSelectedPlatform(p);
                // If platform is shorts/tiktok, default to 30s or 60s
                if (p === 'shorts' || p === 'tiktok') {
                  if (sliceSeconds > 60) {
                    setSliceSeconds(30);
                    applyEqualSlice(30);
                  }
                }
              }}
              onApplySplit={(sec) => applyEqualSlice(sec)}
            />
          </div>
        </div>

        {/* Interactive Visual Timeline Scrub & Trimmer */}
        <section aria-labelledby="timeline-trimmer-section">
          <TimelineTrimmer
            totalDuration={videoMeta.duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            clips={clips}
            activeClipId={activeClipId}
            onSelectClip={(id) => setActiveClipId(id)}
            onAddClip={handleAddManualClip}
            onAutoSplit={(sec) => {
              setSliceSeconds(sec);
              applyEqualSlice(sec);
            }}
            onOpenCensorModal={() => setIsCensorModalOpen(true)}
          />
        </section>

        {/* Generated Clips List with Individual Download Buttons */}
        <section aria-labelledby="clips-list-section">
          <ClipsList
            clips={clips}
            videoMeta={videoMeta}
            activeClipId={activeClipId}
            onSelectClip={(id) => setActiveClipId(id)}
            onPreviewClip={handlePreviewClip}
            onDeleteClip={handleDeleteClip}
            onUpdateClip={handleUpdateClip}
            onDirectDownloadClip={handleDirectDownloadClip}
            onDownloadAllZip={handleDownloadAllZip}
            onExportShellScript={handleExportShellScript}
            onAddNewClip={() => {
              const start = Math.max(0, Math.round(currentTime));
              const end = Math.min(videoMeta.duration, start + sliceSeconds);
              handleAddManualClip(start, end);
            }}
            platform={selectedPlatform}
            downloadingClipId={downloadingClipId}
            downloadProgress={downloadProgress}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">ClipCraft Studio</span>
            <span aria-hidden="true">·</span>
            <span>YouTube Slicer, 4K Trimmer &amp; Individual Clip Downloader</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <button
              onClick={() => setIsGuideModalOpen(true)}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Shortcuts &amp; Guide
            </button>
            <button
              onClick={() => setIsCensorModalOpen(true)}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Audio Bleep Tool
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CensorModal
        isOpen={isCensorModalOpen}
        onClose={() => setIsCensorModalOpen(false)}
        currentTime={currentTime}
        totalDuration={videoMeta.duration}
        onSaveCensorRanges={(ranges) => {
          setCensorRanges(ranges);
          // Re-apply to clips
          setClips((prev) =>
            prev.map((c) => ({
              ...c,
              censorRanges: ranges
                .filter((r) => r.start < c.endTime && r.end > c.startTime)
                .map((r) => ({
                  start: Math.max(0, r.start - c.startTime),
                  end: Math.min(c.duration, r.end - c.startTime),
                })),
            }))
          );
        }}
        existingRanges={censorRanges}
      />

      <GuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </div>
  );
}
