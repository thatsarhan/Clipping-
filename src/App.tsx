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

export default function App() {
  // Screen Management: 'setup' (Screen 1) or 'workspace' (Screen 2)
  const [currentScreen, setCurrentScreen] = useState<'setup' | 'workspace'>('setup');

  // Video Configuration State
  const [videoMeta, setVideoMeta] = useState<VideoMetadata>(SAMPLE_VIDEOS[0]);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFormat>('shorts');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('4k');
  const [clips, setClips] = useState<ClipSegment[]>([]);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  // Screen 1 -> Screen 2: Proceed
  const handleProceedFromSetup = async (config: {
    videoSource: { type: 'youtube' | 'file' | 'sample'; urlOrFile: string | File; meta?: Partial<VideoMetadata> };
    platform: PlatformFormat;
    quality: VideoQuality;
    sliceSeconds: number;
  }) => {
    setIsLoadingVideo(true);

    setSelectedPlatform(config.platform);
    setSelectedQuality(config.quality);

    let duration = config.videoSource.meta?.duration || 600;
    let title = config.videoSource.meta?.title || 'Video';
    let url = typeof config.videoSource.urlOrFile === 'string' ? config.videoSource.urlOrFile : '';

    if (config.videoSource.type === 'youtube' && url) {
      try {
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
      const file = config.videoSource.urlOrFile;
      url = URL.createObjectURL(file);
      title = file.name.replace(/\.[^/.]+$/, '');

      // Also upload to server so server FFmpeg can trim 4K parts effortlessly
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
          if (upData.url) url = upData.url;
          if (upData.duration) duration = upData.duration;
        }
      } catch {}
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

    // Always use "Part" as prefix
    const newClips = generateEqualSegments(duration, config.sliceSeconds, {
      titlePrefix: 'Part',
    });

    setVideoMeta(newMeta);
    setClips(newClips);
    setIsLoadingVideo(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    setCurrentScreen('workspace'); // Transition to Screen 2
  };

  const handleBackToSetup = () => {
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

      {/* SCREEN 2: Clean Studio Workspace with Playable Native MP4 Parts */}
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
    </div>
  );
}
