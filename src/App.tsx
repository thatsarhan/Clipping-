/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Header } from './components/Header';
import { SetupWizardView } from './components/SetupWizardView';
import { CleanWorkspaceView } from './components/CleanWorkspaceView';
import {
  ClipSegment,
  VideoMetadata,
  PlatformFormat,
  VideoQuality,
} from './types/trimmer';
import { SAMPLE_VIDEOS } from './data/sampleVideos';
import { generateEqualSegments } from './utils/trimmerLogic';
import { Loader2, Scissors, CheckCircle2, HardDrive } from 'lucide-react';

export default function App() {
  // Screen Management: 'setup' (Screen 1) or 'workspace' (Screen 2)
  const [currentScreen, setCurrentScreen] = useState<'setup' | 'workspace'>('setup');

  // Video Configuration State
  const [videoMeta, setVideoMeta] = useState<VideoMetadata>(SAMPLE_VIDEOS[0]);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFormat>('shorts');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('4k');
  const [clips, setClips] = useState<ClipSegment[]>([]);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string>('Preparing video stream...');
  const [loadingPercent, setLoadingPercent] = useState<number>(10);

  // Screen 1 -> Screen 2: Proceed with actual downloading & trimming
  const handleProceedFromSetup = async (config: {
    videoSource: { type: 'youtube' | 'file' | 'sample'; urlOrFile: string | File; meta?: Partial<VideoMetadata> };
    platform: PlatformFormat;
    quality: VideoQuality;
    sliceSeconds: number;
  }) => {
    setIsLoadingVideo(true);
    setLoadingPercent(15);
    setLoadingPhase('Downloading video from YouTube / source...');

    setSelectedPlatform(config.platform);
    setSelectedQuality(config.quality);

    let duration = config.videoSource.meta?.duration || 600;
    let title = config.videoSource.meta?.title || 'Video';
    let url = typeof config.videoSource.urlOrFile === 'string' ? config.videoSource.urlOrFile : '';
    let uploadedServerUrl = '';

    // If local file uploaded, upload to temporary processing stream
    if (config.videoSource.type === 'file' && config.videoSource.urlOrFile instanceof File) {
      const file = config.videoSource.urlOrFile;
      url = URL.createObjectURL(file);
      title = file.name.replace(/\.[^/.]+$/, '');
      setLoadingPhase('Uploading file for ultra-fast FFmpeg trimming...');
      setLoadingPercent(30);

      try {
        const uploadRes = await fetch('/api/upload-video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-filename': file.name,
          },
          body: file,
        });
        if (uploadRes.ok) {
          const upData = await uploadRes.json();
          if (upData.url) uploadedServerUrl = upData.url;
          if (upData.duration) duration = upData.duration;
        }
      } catch {}
    } else if (config.videoSource.type === 'youtube' && url) {
      setLoadingPhase('Analyzing YouTube media stream...');
      setLoadingPercent(25);
      try {
        const infoRes = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`);
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          if (infoData.duration) duration = infoData.duration;
          if (infoData.title) title = infoData.title;
        }
      } catch {}
    }

    setLoadingPhase(`Trimming video into ${config.sliceSeconds}s parts with FFmpeg...`);
    setLoadingPercent(55);

    let serverParts: ClipSegment[] = [];
    let sessionId: string | undefined = undefined;

    // Call backend to download and slice video into real parts
    try {
      const targetUrl = uploadedServerUrl || url;
      const splitRes = await fetch('/api/process-and-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          sliceSeconds: config.sliceSeconds,
          platform: config.platform,
          quality: config.quality,
          title,
        }),
      });

      if (splitRes.ok) {
        setLoadingPhase('Optimizing clips and freeing server storage...');
        setLoadingPercent(85);
        const splitData = await splitRes.json();
        sessionId = splitData.sessionId;

        if (Array.isArray(splitData.parts) && splitData.parts.length > 0) {
          serverParts = splitData.parts.map((p: {
            index: number;
            title: string;
            startTime: number;
            endTime: number;
            duration: number;
            streamUrl: string;
            downloadUrl: string;
            size: number;
          }) => ({
            id: `clip_${p.index}`,
            title: p.title || `Part ${p.index}`,
            startTime: p.startTime,
            endTime: p.endTime,
            duration: p.duration,
            serverClipUrl: p.streamUrl,
            fileSize: p.size,
          }));
        }
      }
    } catch (e) {
      console.warn('Backend process-and-split encountered error, falling back to client mode...', e);
    }

    // Fallback clips if server was unreachable or in static client mode
    if (serverParts.length === 0) {
      serverParts = generateEqualSegments(duration, config.sliceSeconds, {
        titlePrefix: 'Part',
      });
    }

    setLoadingPhase('Done! Opening trimmed workspace...');
    setLoadingPercent(100);

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
      sessionId,
    };

    setTimeout(() => {
      setVideoMeta(newMeta);
      setClips(serverParts);
      setIsLoadingVideo(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
      setCurrentScreen('workspace');
    }, 400);
  };

  const handleBackToSetup = () => {
    // If there was an active session on the server, clean it up immediately
    if (videoMeta.sessionId) {
      try {
        fetch('/api/cleanup-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: videoMeta.sessionId }),
        });
      } catch {}
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
    setCurrentScreen('setup');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* Top Header */}
      <Header onReset={handleBackToSetup} />

      {/* SCREEN 1: Setup Wizard */}
      {currentScreen === 'setup' && (
        <main className="flex-1">
          <SetupWizardView
            onProceed={handleProceedFromSetup}
            isLoading={isLoadingVideo}
          />
        </main>
      )}

      {/* SCREEN 2: Clean Studio Workspace with Playable Trimmed Parts */}
      {currentScreen === 'workspace' && (
        <main className="flex-1">
          <CleanWorkspaceView
            videoMeta={videoMeta}
            clips={clips}
            platform={selectedPlatform}
            quality={selectedQuality}
            onBackToSetup={handleBackToSetup}
          />
        </main>
      )}

      {/* Real-time Video Download & Trimming Modal */}
      {isLoadingVideo && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30">
              <Scissors className="w-8 h-8 animate-pulse -rotate-45" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Downloading & Trimming Video
              </h3>
              <p className="text-xs text-slate-400">
                {loadingPhase}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 text-left">
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${loadingPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Processing parts</span>
                <span className="text-emerald-400 font-semibold">{loadingPercent}%</span>
              </div>
            </div>

            {/* Storage Protection note */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-left flex items-start gap-2.5 text-xs text-slate-400">
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Smart Storage:</strong> Full source video is removed immediately after trimming to keep server lightweight.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
