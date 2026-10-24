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

  // 2. Client-side JSZip: Fetch every single real clip blob and pack into ZIP
  const zip = new JSZip();
  let validFilesCount = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const partFilename = `Part_${i + 1}_${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;

    try {
      let clipBlob: Blob | null = null;

      if (clip.videoBlobUrl) {
        const bRes = await fetch(clip.videoBlobUrl);
        clipBlob = await bRes.blob();
      } else if (clip.serverClipUrl) {
        const bRes = await fetch(clip.serverClipUrl);
        if (bRes.ok) {
          clipBlob = await bRes.blob();
        }
      }

      if (clipBlob && clipBlob.size > 10000 && !clipBlob.type.includes('json')) {
        zip.file(partFilename, clipBlob);
        validFilesCount++;
      }
    } catch {}

    if (onProgress) {
      onProgress(Math.round(((i + 1) / clips.length) * 90));
    }
  }

  if (validFilesCount === 0) {
    throw new Error('No valid video files available to zip.');
  }

  const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (onProgress) onProgress(90 + Math.round(metadata.percent * 0.1));
  });

  triggerDownload(content, `${videoMeta.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_all_parts.zip`);
}
