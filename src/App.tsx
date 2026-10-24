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
import { Loader2, Scissors, CheckCircle2, HardDrive, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

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
  const [backendErrorModal, setBackendErrorModal] = useState<string | null>(null);

  // Screen 1 -> Screen 2: Proceed with actual downloading & trimming
  const handleProceedFromSetup = async (config: {
    videoSource: { type: 'youtube' | 'file' | 'sample'; urlOrFile: string | File; meta?: Partial<VideoMetadata> };
    platform: PlatformFormat;
    quality: VideoQuality;
    sliceSeconds: number;
  }) => {
    setIsLoadingVideo(true);
    setLoadingPercent(15);
    setLoadingPhase('Downloading video stream with node yt-dlp...');

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

    setLoadingPhase(`Slicing video into ${config.sliceSeconds}s real MP4 parts with FFmpeg...`);
    setLoadingPercent(60);

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
        setLoadingPhase('Finalizing parts and releasing server storage...');
        setLoadingPercent(90);
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
            thumbnailUrl?: string;
            size: number;
          }) => ({
            id: `clip_${p.index}`,
            title: p.title || `Part ${p.index}`,
            startTime: p.startTime,
            endTime: p.endTime,
            duration: p.duration,
            serverClipUrl: p.streamUrl,
            thumbnailUrl: p.thumbnailUrl,
            fileSize: p.size,
          }));
        }
      } else {
        const errJson = await splitRes.json().catch(() => ({}));
        console.warn('Backend process-and-split returned error:', errJson);
      }
    } catch (e) {
      console.warn('Backend process-and-split connection error:', e);
    }

    // If server trimming succeeded, go to workspace
    if (serverParts.length > 0) {
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
      return;
    }

    // If user provided a sample video or local file, we can fall back to browser playback
    if (config.videoSource.type === 'sample' || config.videoSource.type === 'file') {
      const fallbackClips = generateEqualSegments(duration, config.sliceSeconds, {
        titlePrefix: 'Part',
      });
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
      setClips(fallbackClips);
      setIsLoadingVideo(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
      setCurrentScreen('workspace');
      return;
    }

    // If YouTube video failed to download (e.g. running on static Vercel host without FFmpeg)
    setIsLoadingVideo(false);
    setBackendErrorModal(
      'YouTube video downloading requires our Full-Stack Cloud Run server with FFmpeg. If you are viewing on a static host (like Vercel), please open the Cloud Run app link below or upload a video file directly.'
    );
  };

  const handleBackToSetup = () => {
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

      {/* Backend / Static Error Dialog */}
      {backendErrorModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-bold text-white">
                Full-Stack Server Required
              </h3>
              <p className="text-xs text-slate-400 text-left leading-relaxed">
                {backendErrorModal}
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <a
                href="https://ais-dev-yfp5pqlc7d3p26iilsu5e6-555336126681.asia-east1.run.app"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-red-600/20"
              >
                <span>Open Full-Stack Cloud Run App</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={() => setBackendErrorModal(null)}
                className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Dismiss & Try Uploading File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
