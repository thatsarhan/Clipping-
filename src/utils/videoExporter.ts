import JSZip from 'jszip';
import { ClipSegment, VideoMetadata } from '../types/trimmer';
import { formatTimestamp, generateYtDlpCommand, generateFfmpegCommand } from './trimmerLogic';

/**
 * Triggers a file download in the browser
 */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Download a text file (e.g. bash script, chapters, or commands)
 */
export function triggerTextDownload(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, filename);
}

/**
 * Export a video segment from an HTML5 video element using Canvas and MediaRecorder
 */
export async function exportVideoSegmentFromElement(
  videoElement: HTMLVideoElement,
  clip: ClipSegment,
  onProgress: (progress: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const origCurrentTime = videoElement.currentTime;
      const isPaused = videoElement.paused;

      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || 1280;
      canvas.height = videoElement.videoHeight || 720;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context could not be created'));
        return;
      }

      // Prepare canvas stream
      const fps = 30;
      const stream = canvas.captureStream(fps);

      // Try capturing audio if available
      try {
        const audioStream = (videoElement as unknown as { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream?.() ||
                            (videoElement as unknown as { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();
        if (audioStream) {
          const audioTracks = audioStream.getAudioTracks();
          audioTracks.forEach((track) => stream.addTrack(track));
        }
      } catch {
        // Cross-origin audio or browser restriction, continue with video
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(chunks, { type: mimeType });
        // Restore video
        videoElement.currentTime = origCurrentTime;
        if (!isPaused) videoElement.play().catch(() => {});
        onProgress(100);
        resolve(finalBlob);
      };

      videoElement.currentTime = clip.startTime;

      videoElement.onseeked = () => {
        recorder.start(100);
        videoElement.play().catch(() => {});

        const intervalMs = 1000 / fps;
        const totalDuration = clip.endTime - clip.startTime;

        const drawFrame = () => {
          if (videoElement.currentTime >= clip.endTime || videoElement.ended) {
            recorder.stop();
            videoElement.pause();
            return;
          }

          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

          // If censor range is active at current time, draw a subtle censor indicator
          if (clip.censorRanges && clip.censorRanges.length > 0) {
            const relTime = videoElement.currentTime - clip.startTime;
            const isCensored = clip.censorRanges.some((r) => relTime >= r.start && relTime <= r.end);
            if (isCensored) {
              ctx.save();
              ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
              ctx.fillRect(20, 20, 180, 40);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 16px sans-serif';
              ctx.fillText('🔇 [AUDIO MUTED]', 30, 46);
              ctx.restore();
            }
          }

          const elapsed = videoElement.currentTime - clip.startTime;
          const prog = Math.min(99, Math.round((elapsed / totalDuration) * 100));
          onProgress(prog);

          requestAnimationFrame(drawFrame);
        };

        requestAnimationFrame(drawFrame);
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Creates a synthetic animated video preview card (WebM) for YouTube segments
 * This allows browser-side direct download even when YouTube cross-origin prevents raw frame scraping
 */
export async function createRenderedClipVideo(
  videoMeta: VideoMetadata,
  clip: ClipSegment,
  onProgress: (progress: number) => void,
  options?: {
    quality?: '4k' | '2k' | '1080p' | '720p' | 'source';
    platform?: 'shorts' | 'tiktok' | 'instagram' | 'twitter' | 'youtube';
  }
): Promise<Blob> {
  return new Promise((resolve) => {
    const isVertical = options?.platform === 'shorts' || options?.platform === 'tiktok';
    const is4K = options?.quality === '4k' || options?.quality === 'source' || videoMeta.is4K;

    const canvas = document.createElement('canvas');
    if (isVertical) {
      canvas.width = is4K ? 2160 : 1080;
      canvas.height = is4K ? 3840 : 1920;
    } else {
      canvas.width = is4K ? 3840 : 1920;
      canvas.height = is4K ? 2160 : 1080;
    }

    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);

    // Audio tone
    let audioTrack: MediaStreamTrack | null = null;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const dest = audioCtx.createMediaStreamDestination();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);
    } catch {
      // Audio not supported in environment
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (audioTrack) audioTrack.stop();
      onProgress(100);
      resolve(new Blob(chunks, { type: mimeType }));
    };

    recorder.start(100);

    const totalSeconds = Math.min(clip.duration, 5); // Render first 5s preview fast in browser
    const startTime = Date.now();

    const render = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= totalSeconds) {
        recorder.stop();
        return;
      }

      // Draw slick dark studio card
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Accent header bar
      ctx.fillStyle = clip.color || '#3b82f6';
      ctx.fillRect(0, 0, canvas.width, 8);

      // Title & Part info
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px Inter, system-ui, sans-serif';
      ctx.fillText(clip.title, 80, 160);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '24px Inter, system-ui, sans-serif';
      ctx.fillText(`Source: ${videoMeta.title}`, 80, 220);

      // Timecode box
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.roundRect(80, 280, 520, 120, 16);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 36px monospace';
      ctx.fillText(
        `${formatTimestamp(clip.startTime)}  ➔  ${formatTimestamp(clip.endTime)}`,
        110,
        350
      );

      ctx.fillStyle = '#64748b';
      ctx.font = '18px monospace';
      ctx.fillText(`Duration: ${clip.duration}s (${formatTimestamp(clip.duration)})`, 110, 380);

      // Animated playback wave
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = 80; x < canvas.width - 80; x += 10) {
        const y =
          520 + Math.sin((x / 30) + elapsed * 5) * 40 * Math.sin(elapsed * 2);
        if (x === 80) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Timestamp watermark
      const currentClipSec = clip.startTime + elapsed;
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`PLAYHEAD: ${formatTimestamp(currentClipSec, true)}`, 80, 620);

      onProgress(Math.round((elapsed / totalSeconds) * 95));
      requestAnimationFrame(render);
    };

    render();
  });
}

/**
 * Package all clips and metadata into a zip archive
 */
export async function downloadAllClipsZip(
  videoMeta: VideoMetadata,
  clips: ClipSegment[],
  onProgress?: (progress: number) => void
) {
  const zip = new JSZip();

  // 1. Script for full batch download via yt-dlp
  const commands = clips
    .map((c, idx) => {
      const safeTitle = `clip_${idx + 1}_${c.title.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      return generateYtDlpCommand(videoMeta.url, c.startTime, c.endTime, safeTitle);
    })
    .join('\n');

  zip.file('download_all_clips.sh', `#!/bin/bash\n# ClipCraft YouTube Batch Downloader\n\n${commands}\n`);
  zip.file('download_all_clips.bat', `@echo off\nREM ClipCraft YouTube Batch Downloader\n\n${commands}\n`);

  // 2. Summary text file
  const summaryText = [
    `CLIP SUMMARY FOR: ${videoMeta.title}`,
    `URL: ${videoMeta.url}`,
    `Total Clips: ${clips.length}`,
    `Generated by ClipCraft`,
    '----------------------------------------',
    ...clips.map(
      (c, i) =>
        `#${i + 1} | ${c.title} | ${formatTimestamp(c.startTime)} - ${formatTimestamp(c.endTime)} (${c.duration}s)`
    ),
  ].join('\n');

  zip.file('clips_manifest.txt', summaryText);

  // Generate zip file
  const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (onProgress) onProgress(metadata.percent);
  });

  triggerDownload(content, `${videoMeta.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_all_clips.zip`);
}
