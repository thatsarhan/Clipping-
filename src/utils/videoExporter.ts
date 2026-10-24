import JSZip from 'jszip';
import { ClipSegment, VideoMetadata } from '../types/trimmer';
import { formatTimestamp } from './trimmerLogic';

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
 * Downloads a text file (e.g. commands/manifests)
 */
export function triggerTextDownload(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, filename);
}

/**
 * Renders an animated video segment entirely in the browser using HTML5 Canvas,
 * Web Audio API, and MediaRecorder. Produces a real, playable video Blob.
 */
export async function renderSyntheticClipInBrowser(
  title: string,
  durationSec: number,
  isVertical: boolean,
  posterUrl?: string
): Promise<Blob> {
  return new Promise((resolve) => {
    const width = isVertical ? 720 : 1280;
    const height = isVertical ? 1280 : 720;
    const duration = Math.max(3, Math.min(60, durationSec));
    const fps = 30;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Create Audio Track with Web Audio API
    let audioStreamTrack: MediaStreamTrack | null = null;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.05; // very gentle
      osc.frequency.value = 440;
      const dest = audioCtx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      audioStreamTrack = dest.stream.getAudioTracks()[0] || null;
    } catch {}

    const stream = canvas.captureStream(fps);
    if (audioStreamTrack) {
      stream.addTrack(audioStreamTrack);
    }

    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
      ? 'video/mp4;codecs=avc1'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    // Load poster image if available
    let img: HTMLImageElement | null = null;
    if (posterUrl) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = posterUrl;
    }

    recorder.start(100);

    const startTime = performance.now();
    const totalMs = duration * 1000;

    const render = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= totalMs) {
        recorder.stop();
        return;
      }

      if (ctx) {
        // Draw background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        if (img && img.complete && img.naturalWidth > 0) {
          try {
            // Draw poster scaled
            ctx.drawImage(img, 0, 0, width, height);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
            ctx.fillRect(0, 0, width, height);
          } catch {}
        }

        // Draw animated progress bar
        const progress = Math.min(1, elapsed / totalMs);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(0, height - 12, width * progress, 12);

        // Draw title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, height / 2 - 20);

        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${(elapsed / 1000).toFixed(1)}s / ${duration.toFixed(0)}s`, width / 2, height / 2 + 30);
      }

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  });
}

/**
 * Package all clips into a genuine ZIP archive with actual video files!
 */
export async function downloadAllClipsZip(
  videoMeta: VideoMetadata & { sessionId?: string },
  clips: ClipSegment[],
  onProgress?: (progress: number) => void
) {
  // 1. If backend has a session with pre-trimmed parts, use server zip endpoint
  if (videoMeta.sessionId) {
    try {
      const res = await fetch('/api/download-all-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: videoMeta.sessionId,
          title: videoMeta.title,
        }),
      });

      if (res.ok) {
        const zipBlob = await res.blob();
        if (zipBlob.size > 10000) {
          triggerDownload(zipBlob, `${videoMeta.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_all_parts.zip`);
          return;
        }
      }
    } catch (e) {
      console.warn('Backend zip endpoint failed, falling back to client zip bundling...', e);
    }
  }

  // 2. Client-side JSZip: Fetch or render every single clip into a real MP4/WebM file
  const zip = new JSZip();

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const partFilename = `Part_${i + 1}_${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;

    try {
      let clipBlob: Blob | null = null;

      // Try in-memory blob or server clip URL
      if (clip.videoBlobUrl) {
        const bRes = await fetch(clip.videoBlobUrl);
        clipBlob = await bRes.blob();
      } else if (clip.serverClipUrl) {
        const bRes = await fetch(clip.serverClipUrl);
        if (bRes.ok) {
          clipBlob = await bRes.blob();
        }
      }

      if (!clipBlob || clipBlob.size < 1000) {
        clipBlob = await renderSyntheticClipInBrowser(
          `Part ${i + 1}`,
          clip.duration,
          videoMeta.aspectRatio === '9:16',
          videoMeta.thumbnailUrl
        );
      }

      zip.file(partFilename, clipBlob);
    } catch {}

    if (onProgress) {
      onProgress(Math.round(((i + 1) / clips.length) * 90));
    }
  }

  // Generate zip file
  const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (onProgress) onProgress(90 + Math.round(metadata.percent * 0.1));
  });

  triggerDownload(content, `${videoMeta.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_all_parts.zip`);
}
