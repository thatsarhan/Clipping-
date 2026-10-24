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
 * Download real trimmed clip
 * First attempts server-side 4K trimming via /api/download-clip for YouTube URLs.
 * If local element is provided, uses real HTML5 video canvas frame capture.
 */
export async function downloadRealClip(
  videoMeta: VideoMetadata,
  clip: ClipSegment,
  videoElement: HTMLVideoElement | null,
  onProgress: (progress: number) => void,
  options?: {
    quality?: '4k' | '2k' | '1080p' | '720p' | 'source';
    platform?: 'shorts' | 'tiktok' | 'instagram' | 'twitter' | 'youtube';
  }
): Promise<void> {
  const quality = options?.quality || (videoMeta.is4K ? '4k' : '1080p');
  const platform = options?.platform || 'youtube';
  const safeFilename = `${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${quality}.mp4`;

  onProgress(15);

  // 1. If YouTube video, call backend endpoint to fetch and slice the real stream
  if (videoMeta.type === 'youtube') {
    onProgress(30);
    const params = new URLSearchParams({
      url: videoMeta.url,
      start: clip.startTime.toString(),
      end: clip.endTime.toString(),
      quality,
      format: platform,
      title: clip.title,
    });

    const apiUrl = `/api/download-clip?${params.toString()}`;

    try {
      const response = await fetch(apiUrl);
      if (response.ok) {
        onProgress(80);
        const blob = await response.blob();
        onProgress(100);
        triggerDownload(blob, safeFilename);
        return;
      }
    } catch (e) {
      console.warn('Backend download-clip failed, trying fallback stream...', e);
    }
  }

  // 2. If we have a real HTML5 video element (uploaded file or direct MP4 sample)
  if (videoElement) {
    onProgress(25);
    const blob = await exportVideoSegmentFromElement(
      videoElement,
      clip,
      (p) => onProgress(Math.max(25, Math.min(98, p)))
    );
    onProgress(100);
    triggerDownload(blob, safeFilename);
    return;
  }

  // 3. Fallback: trigger direct stream or script
  onProgress(100);
  const command = generateYtDlpCommand(videoMeta.url, clip.startTime, clip.endTime, safeFilename, quality);
  triggerTextDownload(
    `# 4K Clip Downloader Command\n${command}\n`,
    `download_${safeFilename}.sh`
  );
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
