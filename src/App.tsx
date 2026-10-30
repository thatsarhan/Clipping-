/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { SetupWizardView } from './components/SetupWizardView';
import { CleanWorkspaceView } from './components/CleanWorkspaceView';
import {
  ClipSegment,
  VideoMetadata,
  PlatformFormat,
  VideoQuality,
  OutputOrientation,
} from './types/trimmer';
import { SAMPLE_VIDEOS } from './data/sampleVideos';
import { extractYouTubeId } from './utils/trimmerLogic';
import {
  Loader2,
  Scissors,
  HardDrive,
  AlertTriangle,
  ExternalLink,
  Download,
  XCircle,
} from 'lucide-react';

export default function App() {
  // Screen Management: 'setup' (Screen 1) or 'workspace' (Screen 2)
  const [currentScreen, setCurrentScreen] = useState<'setup' | 'workspace'>('setup');
  const [activeSourceTab, setActiveSourceTab] = useState<'youtube' | 'sample' | 'upload'>('youtube');
  const [lastAttemptedUrl, setLastAttemptedUrl] = useState<string>('');

  // Video Configuration State
  const [videoMeta, setVideoMeta] = useState<VideoMetadata>(SAMPLE_VIDEOS[0]);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFormat>('shorts');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('4k');
  const [selectedOrientation, setSelectedOrientation] = useState<OutputOrientation>('9:16');
  const [clips, setClips] = useState<ClipSegment[]>([]);

  // Asynchronous Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string>('Submitting processing job...');
  const [loadingPercent, setLoadingPercent] = useState<number>(5);
  const [backendErrorModal, setBackendErrorModal] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  // Screen 1 -> Screen 2: Proceed with actual asynchronous job creation & trimming
  const handleProceedFromSetup = async (config: {
    videoSource: { type: 'youtube' | 'file' | 'sample'; urlOrFile: string | File; meta?: Partial<VideoMetadata> };
    orientation: OutputOrientation;
    platform: PlatformFormat;
    quality: VideoQuality;
    sliceSeconds: number;
  }) => {
    stopPolling();
    setIsLoadingVideo(true);
    setLoadingPercent(5);
    setLoadingPhase('Validating video stream and preparing background job...');

    setSelectedPlatform(config.platform);
    setSelectedQuality(config.quality);
    setSelectedOrientation(config.orientation);

    let duration = config.videoSource.meta?.duration || 600;
    let title = config.videoSource.meta?.title || 'Video';
    let url = typeof config.videoSource.urlOrFile === 'string' ? config.videoSource.urlOrFile : '';
    let targetJobUrl = url;
    setLastAttemptedUrl(url);

    // If local file uploaded, stream to server first
    if (config.videoSource.type === 'file' && config.videoSource.urlOrFile instanceof File) {
      const file = config.videoSource.urlOrFile;
      url = URL.createObjectURL(file);
      title = file.name.replace(/\.[^/.]+$/, '');
      setLoadingPhase('Uploading file to server for genuine FFmpeg slicing...');
      setLoadingPercent(15);

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
          if (upData.url) targetJobUrl = upData.url;
          if (upData.duration) duration = upData.duration;
        } else {
          throw new Error('Failed to upload video file to server.');
        }
      } catch (err: unknown) {
        setIsLoadingVideo(false);
        setBackendErrorModal(err instanceof Error ? err.message : 'Upload failed.');
        return;
      }
    }

    // Call /api/jobs/create
    try {
      setLoadingPhase('Creating video segmentation job...');
      setLoadingPercent(20);

      const createRes = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetJobUrl,
          sliceSeconds: config.sliceSeconds,
          orientation: config.orientation,
          quality: config.quality,
          title,
        }),
      });

      if (!createRes.ok) {
        const errJson = await createRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to submit processing job.');
      }

      const createData = await createRes.json();
      const jobId = createData.jobId;
      setActiveJobId(jobId);

      // Start Polling loop
      pollIntervalRef.current = setInterval(async () => {
        try {
          const jobRes = await fetch(`/api/jobs/${jobId}`);
          if (!jobRes.ok) return;

          const job = await jobRes.json();
          if (job.progress !== undefined) {
            setLoadingPercent(job.progress);
          }
          if (job.phaseDescription) {
            setLoadingPhase(job.phaseDescription);
          }

          if (job.status === 'completed') {
            stopPolling();
            setIsLoadingVideo(false);

            if (Array.isArray(job.clips) && job.clips.length > 0) {
              const formattedClips: ClipSegment[] = job.clips.map((p: any) => ({
                id: p.id || `clip_${p.index}`,
                title: p.title || `Clip ${p.index}`,
                startTime: p.startTime,
                endTime: p.endTime,
                duration: p.duration,
                serverClipUrl: p.streamUrl,
                thumbnailUrl: p.thumbnailUrl,
                fileSize: p.size,
              }));

              const newMeta: VideoMetadata = {
                id: jobId,
                type: config.videoSource.type,
                title: job.sourceTitle || title,
                url,
                duration: job.sourceDuration || duration,
                thumbnailUrl: config.videoSource.meta?.thumbnailUrl,
                aspectRatio: config.orientation === '9:16' ? '9:16' : config.orientation === '1:1' ? '1:1' : '16:9',
                resolution: config.quality === '4k' ? '4K Ultra HD (2160p)' : `${config.quality.toUpperCase()} HD`,
                is4K: config.quality === '4k',
                sessionId: jobId,
              };

              setVideoMeta(newMeta);
              setClips(formattedClips);
              window.scrollTo({ top: 0, behavior: 'instant' });
              setCurrentScreen('workspace');
            } else {
              setBackendErrorModal('Job completed but no video clips were produced.');
            }
          } else if (job.status === 'failed') {
            stopPolling();
            setIsLoadingVideo(false);
            setBackendErrorModal(job.error || 'Video processing encountered an error.');
          } else if (job.status === 'cancelled') {
            stopPolling();
            setIsLoadingVideo(false);
          }
        } catch (e) {
          console.warn('Job polling error:', e);
        }
      }, 800);
    } catch (e: unknown) {
      stopPolling();
      setIsLoadingVideo(false);
      setBackendErrorModal(e instanceof Error ? e.message : 'Server connection error.');
    }
  };

  const handleCancelJob = async () => {
    if (activeJobId) {
      try {
        await fetch(`/api/jobs/${activeJobId}/cancel`, { method: 'POST' });
      } catch {}
    }
    stopPolling();
    setIsLoadingVideo(false);
    setActiveJobId(null);
  };

  const handleBackToSetup = () => {
    stopPolling();
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
            activeSourceTab={activeSourceTab}
            onTabChange={setActiveSourceTab}
          />
        </main>
      )}

      {/* SCREEN 2: Studio Workspace with Playable Sliced Parts */}
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
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30">
              <Scissors className="w-8 h-8 animate-pulse -rotate-45" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Processing &amp; Slicing Video
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed font-mono">
                {loadingPhase}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 text-left">
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(5, loadingPercent))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>FFmpeg Segmentation Engine</span>
                <span className="text-emerald-400 font-semibold">{loadingPercent}%</span>
              </div>
            </div>

            {/* Storage Protection note */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-left flex items-start gap-2.5 text-xs text-slate-400">
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Smart Storage:</strong> Slices are encoded directly and source footage is released after processing to prevent server bloat.
              </span>
            </div>

            {/* Cancel Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCancelJob}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Cancel Processing</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backend / Video Stream Guidance Dialog */}
      {backendErrorModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-bold text-white">
                Video Processing Notice
              </h3>
              <p className="text-xs text-slate-300 text-left leading-relaxed">
                {backendErrorModal}
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              {/* If user provided a YouTube URL, offer direct device download helper */}
              {extractYouTubeId(lastAttemptedUrl) && (
                <a
                  href={`https://ssyoutube.com/watch?v=${extractYouTubeId(lastAttemptedUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-red-600/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Video to Device First (Free)</span>
                  <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveSourceTab('upload');
                  setBackendErrorModal(null);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <span>Upload Video File (100% Genuine Video)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSourceTab('sample');
                  setBackendErrorModal(null);
                }}
                className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Try 4K Demo Video
              </button>

              <button
                type="button"
                onClick={() => setBackendErrorModal(null)}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-400 pt-1 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
