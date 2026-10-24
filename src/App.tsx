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
  ArrowLeft,
  FolderArchive,
  Terminal,
  ShieldCheck,
  Check,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Header } from './components/Header';
import { SetupWizardView } from './components/SetupWizardView';
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
  downloadRealClip,
  triggerTextDownload,
  downloadAllClipsZip,
} from './utils/videoExporter';

export default function App() {
  // Screen Management: 'setup' (Screen 1) or 'workspace' (Screen 2)
  const [currentScreen, setCurrentScreen] = useState<'setup' | 'workspace'>('setup');

  // Video and Configuration State
  const [videoMeta, setVideoMeta] = useState<VideoMetadata>(SAMPLE_VIDEOS[0]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  const [sliceSeconds, setSliceSeconds] = useState<number>(30); // 30s Shorts default
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFormat>('shorts');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('4k');

  // Clips Collection
  const [clips, setClips] = useState<ClipSegment[]>([]);

  // Download & Rendering Progress
  const [downloadingClipId, setDownloadingClipId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  // Modals
  const [isCensorModalOpen, setIsCensorModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [censorRanges, setCensorRanges] = useState<{ start: number; end: number }[]>([]);

  // Ref to video element
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Auto-slice helper
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

  // SCREEN 1 -> SCREEN 2 TRANSITION: Proceed
  const handleProceedFromSetup = async (config: {
    videoSource: { type: 'youtube' | 'file' | 'sample'; urlOrFile: string | File; meta?: Partial<VideoMetadata> };
    platform: PlatformFormat;
    quality: VideoQuality;
    sliceSeconds: number;
  }) => {
    setIsLoadingVideo(true);

    setSelectedPlatform(config.platform);
    setSelectedQuality(config.quality);
    setSliceSeconds(config.sliceSeconds);

    let duration = config.videoSource.meta?.duration || 600;
    let title = config.videoSource.meta?.title || 'Video';
    let url = typeof config.videoSource.urlOrFile === 'string' ? config.videoSource.urlOrFile : '';

    if (config.videoSource.type === 'youtube' && url) {
      try {
        // Try fetching real video info from server
        const infoRes = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`);
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          if (infoData.duration) duration = infoData.duration;
          if (infoData.title) title = infoData.title;
        }
      } catch {
        // fallback
      }
    } else if (config.videoSource.type === 'file' && config.videoSource.urlOrFile instanceof File) {
      url = URL.createObjectURL(config.videoSource.urlOrFile);
      title = config.videoSource.urlOrFile.name.replace(/\.[^/.]+$/, '');
    }

    const newMeta: VideoMetadata = {
      id: `vid_${Date.now()}`,
      type: config.videoSource.type,
      title,
      url,
      duration,
      thumbnailUrl: config.videoSource.meta?.thumbnailUrl,
      aspectRatio: config.platform === 'shorts' || config.platform === 'tiktok' ? '9:16' : '16:9',
      resolution: config.quality === '4k' ? '4K Ultra HD (2160p)' : '1080p Full HD',
      is4K: config.quality === '4k',
    };

    setVideoMeta(newMeta);
    applyEqualSlice(config.sliceSeconds, duration);
    setIsLoadingVideo(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    setCurrentScreen('workspace'); // Move to Screen 2!
  };

  // Handle Seek
  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = time;
    }
  };

  // Manual clip
  const handleAddManualClip = (start: number, end: number, clipTitle?: string) => {
    const newClip: ClipSegment = {
      id: `clip_${Date.now()}`,
      title: clipTitle || `Custom Part #${clips.length + 1} (${formatTimestamp(start)} - ${formatTimestamp(end)})`,
      startTime: start,
      endTime: end,
      duration: Math.round((end - start) * 10) / 10,
      color: '#10B981',
    };
    setClips([...clips, newClip]);
    setActiveClipId(newClip.id);
  };

  const handleUpdateClip = (clipId: string, updated: Partial<ClipSegment>) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, ...updated } : c))
    );
  };

  const handleDeleteClip = (clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    if (activeClipId === clipId) setActiveClipId(null);
  };

  const handlePreviewClip = (clip: ClipSegment) => {
    setActiveClipId(clip.id);
    handleSeek(clip.startTime);
    if (videoElementRef.current) {
      videoElementRef.current.play().catch(() => {});
    }
  };

  // REAL VIDEO DOWNLOAD HANDLER (NO MORE BLACK SCREEN OR BEEP!)
  const handleDirectDownloadClip = async (clip: ClipSegment) => {
    setDownloadingClipId(clip.id);
    setDownloadProgress(10);

    try {
      await downloadRealClip(
        videoMeta,
        clip,
        videoElementRef.current,
        (p) => setDownloadProgress(p),
        {
          quality: selectedQuality,
          platform: selectedPlatform,
        }
      );
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setTimeout(() => {
        setDownloadingClipId(null);
        setDownloadProgress(0);
      }, 500);
    }
  };

  // Batch Zip download
  const handleDownloadAllZip = async () => {
    await downloadAllClipsZip(videoMeta, clips);
  };

  // Export batch shell script
  const handleExportShellScript = () => {
    const is4K = selectedQuality === '4k';
    const lines = [
      '#!/bin/bash',
      `# ClipCraft 4K Batch Downloader: ${videoMeta.title}`,
      `# Quality: ${selectedQuality.toUpperCase()} | Platform: ${selectedPlatform.toUpperCase()}`,
      '',
      ...clips.map((c, i) => {
        const safe = `part_${i + 1}_${c.title.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        return generateYtDlpCommand(videoMeta.url, c.startTime, c.endTime, safe, is4K ? '4k' : '1080p');
      }),
      '',
      'echo "All clips downloaded!"',
    ];

    triggerTextDownload(lines.join('\n'), `download_clips_${Date.now()}.sh`);
  };

  const activeClip = clips.find((c) => c.id === activeClipId) || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* Top Header */}
      <Header
        onOpenHelp={() => setIsGuideModalOpen(true)}
        onOpenSample={(id) => {
          const sample = SAMPLE_VIDEOS.find((s) => s.id === id) || SAMPLE_VIDEOS[0];
          handleProceedFromSetup({
            videoSource: { type: 'sample', urlOrFile: sample.url, meta: sample },
            platform: 'shorts',
            quality: '4k',
            sliceSeconds: 30,
          });
        }}
        totalClips={clips.length}
      />

      {/* SCREEN 1: Setup Wizard Screen */}
      {currentScreen === 'setup' && (
        <main className="flex-1">
          <SetupWizardView
            onProceed={handleProceedFromSetup}
            isLoading={isLoadingVideo}
          />
        </main>
      )}

      {/* SCREEN 2: Workspace & Video Slicer Studio */}
      {currentScreen === 'workspace' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Top Navigation & Video Info Banner with Prominent DOWNLOAD ALL */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'instant' });
                  setCurrentScreen('setup');
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-xs font-medium transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>← New Video / Settings</span>
              </button>

              <div>
                <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-md">
                  {videoMeta.title}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span className="font-mono">{formatTimestamp(videoMeta.duration)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-semibold">{selectedQuality.toUpperCase()} UHD</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-400 uppercase font-semibold">{selectedPlatform}</span>
                </div>
              </div>
            </div>

            {/* Prominent DOWNLOAD ALL Button right at top */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportShellScript}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-xl border border-slate-800 transition-colors cursor-pointer"
              >
                <Terminal className="w-4 h-4 text-amber-400" />
                <span>Script (.sh)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadAllZip}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                title="Download all clips packaged in a zip"
              >
                <FolderArchive className="w-4 h-4" />
                <span>Download All ({clips.length} Clips)</span>
              </button>
            </div>
          </div>

          {/* Player & Duration Slider Studio */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Player View */}
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

            {/* Live Duration Slicer */}
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

          {/* Interactive Timeline Trimmer */}
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

          {/* Generated Clip Parts with INDIVIDUAL DOWNLOAD BUTTONS */}
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
        </main>
      )}

      {/* Modals */}
      <CensorModal
        isOpen={isCensorModalOpen}
        onClose={() => setIsCensorModalOpen(false)}
        currentTime={currentTime}
        totalDuration={videoMeta.duration}
        onSaveCensorRanges={(ranges) => {
          setCensorRanges(ranges);
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
