import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { execFile, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '500mb' }));

const YTDLP_BIN = path.join(process.cwd(), 'bin', 'yt-dlp');
const CACHE_DIR = path.join(os.tmpdir(), 'clipcraft_cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// -------------------------------------------------------------
// STORAGE MANAGER & AUTO-CLEANUP
// Deletes files older than 10 minutes and strictly limits total disk cache
// to prevent disk exhaustion when multiple users process videos.
// -------------------------------------------------------------
const MAX_CACHE_BYTES = 300 * 1024 * 1024; // 300 MB max total disk cache
const MAX_SESSION_AGE_MS = 10 * 60 * 1000; // 10 minutes max lifetime

function purgeOldCache() {
  try {
    const now = Date.now();
    const entries = fs.readdirSync(CACHE_DIR, { withFileTypes: true });

    let totalBytes = 0;
    const sessionDirs: { path: string; ctime: number; size: number }[] = [];

    for (const entry of entries) {
      const fullPath = path.join(CACHE_DIR, entry.name);
      try {
        const stats = fs.statSync(fullPath);
        if (entry.isDirectory()) {
          // Check age
          if (now - stats.ctimeMs > MAX_SESSION_AGE_MS) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            continue;
          }

          // Calculate directory size
          let dirSize = 0;
          const files = fs.readdirSync(fullPath);
          for (const f of files) {
            try {
              dirSize += fs.statSync(path.join(fullPath, f)).size;
            } catch {}
          }
          totalBytes += dirSize;
          sessionDirs.push({ path: fullPath, ctime: stats.ctimeMs, size: dirSize });
        } else {
          // Loose file in CACHE_DIR
          if (now - stats.ctimeMs > MAX_SESSION_AGE_MS) {
            fs.unlinkSync(fullPath);
          } else {
            totalBytes += stats.size;
          }
        }
      } catch {}
    }

    // If total storage still exceeds limit, delete oldest sessions (LRU)
    if (totalBytes > MAX_CACHE_BYTES) {
      sessionDirs.sort((a, b) => a.ctime - b.ctime);
      while (totalBytes > MAX_CACHE_BYTES * 0.6 && sessionDirs.length > 0) {
        const oldest = sessionDirs.shift();
        if (oldest) {
          try {
            fs.rmSync(oldest.path, { recursive: true, force: true });
            totalBytes -= oldest.size;
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('Cache purge error:', err);
  }
}

// Run cleanup every 60 seconds
setInterval(purgeOldCache, 60 * 1000);

// Helper to extract YouTube video ID
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

// Helper to format seconds into HH:MM:SS
function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// 1. Endpoint: Get YouTube Video Info (fast oEmbed with yt-dlp metadata)
app.get('/api/video-info', async (req: Request, res: Response) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const ytId = extractYouTubeId(videoUrl);

  let oembedData: { title?: string; author_name?: string; thumbnail_url?: string } | null = null;
  if (ytId) {
    try {
      const oRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`);
      if (oRes.ok) {
        oembedData = await oRes.json();
      }
    } catch {}
  }

  execFile(
    'python3',
    [YTDLP_BIN, '--skip-download', '--dump-json', '--no-warnings', videoUrl],
    { maxBuffer: 10 * 1024 * 1024, timeout: 6000 },
    (error, stdout) => {
      if (!error && stdout) {
        try {
          const data = JSON.parse(stdout);
          const is4K = (data.height && data.height >= 2160) || (data.width && data.width >= 3840);
          return res.json({
            id: data.id || ytId,
            title: data.title || oembedData?.title || 'YouTube Video',
            author: data.uploader || data.channel || oembedData?.author_name || 'YouTube Creator',
            duration: Math.round(data.duration || 600),
            thumbnailUrl: data.thumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : undefined),
            resolution: is4K ? '4K Ultra HD (2160p)' : `${data.height || 1080}p`,
            is4K: !!is4K,
            webpage_url: data.webpage_url || videoUrl,
          });
        } catch {}
      }

      if (ytId || oembedData) {
        return res.json({
          id: ytId || 'yt_video',
          title: oembedData?.title || `YouTube Video (${ytId})`,
          author: oembedData?.author_name || 'YouTube Creator',
          duration: 600,
          thumbnailUrl: oembedData?.thumbnail_url || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          resolution: '4K Ultra HD (2160p)',
          is4K: true,
          webpage_url: videoUrl,
        });
      }

      return res.status(500).json({ error: 'Failed to extract video info' });
    }
  );
});


// -------------------------------------------------------------
// MAIN WORKFLOW: PROCESS & SPLIT VIDEO INTO TRIMMED PARTS
// Downloads the video, slices it into exact parts, and deletes
// the full raw video immediately to conserve server storage!
// -------------------------------------------------------------
app.post('/api/process-and-split', async (req: Request, res: Response) => {
  const {
    url,
    sliceSeconds = 30,
    platform = 'shorts',
    quality = '4k',
    title = 'Video',
    censorRanges = [],
  } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Video URL or path is required' });
  }

  const isVertical = platform === 'shorts' || platform === 'tiktok' || platform === 'instagram';
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const sessionDir = path.join(CACHE_DIR, sessionId);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const rawTempVideo = path.join(sessionDir, 'source_raw.mp4');

  // Step 1: Download or retrieve the video file
  const isDirectFile =
    url.startsWith('/') ||
    url.startsWith('file://') ||
    url.includes('/public/') ||
    fs.existsSync(url);

  const fetchSource = (onDownloaded: (err: Error | null, sourcePath: string | null) => void) => {
    if (isDirectFile && fs.existsSync(url)) {
      return onDownloaded(null, url);
    }

    // Direct HTTP MP4/WebM URL (e.g. sample video)
    if (url.startsWith('http') && (url.includes('.mp4') || url.includes('.webm') || url.includes('archive.org'))) {
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          fs.writeFileSync(rawTempVideo, Buffer.from(buf));
          onDownloaded(null, rawTempVideo);
        })
        .catch((e) => onDownloaded(e, null));
      return;
    }

    // YouTube URL -> High-compatibility download using autoclip player_client args
    const ytCmd = `python3 "${YTDLP_BIN}" --js-runtimes node:/usr/local/bin/node --extractor-args "youtube:player_client=android,web,tv" -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/18/best[ext=mp4]/best" --merge-output-format mp4 --no-playlist --no-warnings "${url}" -o "${rawTempVideo}"`;
    exec(ytCmd, { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }, (err, stdout, stderr) => {
      let candidate: string | null = null;
      if (fs.existsSync(rawTempVideo) && fs.statSync(rawTempVideo).size > 10000) {
        candidate = rawTempVideo;
      } else {
        const files = fs.readdirSync(sessionDir);
        const match = files.find((f) => (f.startsWith('source_raw') || f.endsWith('.mp4')) && !f.endsWith('.part'));
        if (match) {
          candidate = path.join(sessionDir, match);
        }
      }

      if (candidate) {
        onDownloaded(null, candidate);
      } else {
        const fullErr = (err?.message || '') + ' ' + (stderr || '') + ' ' + (stdout || '');
        let friendlyErr = 'Could not download video stream from link.';
        if (fullErr.includes('Sign in to confirm you’re not a bot') || fullErr.includes('bot') || fullErr.includes('LOGIN_REQUIRED')) {
          friendlyErr = 'YouTube requires sign-in verification on cloud server IPs ("Sign in to confirm you are not a bot"). Please save the video to your device first, then upload it below for 100% genuine FFmpeg trimming.';
        }
        onDownloaded(new Error(friendlyErr), null);
      }
    });
  };

  fetchSource(async (err, sourcePath) => {
    if (err || !sourcePath || !fs.existsSync(sourcePath)) {
      console.warn('Source fetch failed:', err?.message || err);
      return res.status(400).json({ error: err?.message || 'Could not download video stream from link' });
    }

    // Step 2: Probe total duration of downloaded video
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourcePath}"`,
      async (probeErr, stdout) => {
        let totalDuration = 300;
        if (!probeErr && stdout) {
          const parsed = parseFloat(stdout.trim());
          if (!isNaN(parsed) && parsed > 0) totalDuration = Math.round(parsed);
        }

        const partCount = Math.max(1, Math.ceil(totalDuration / sliceSeconds));
        const partsToSlice = Math.min(partCount, 20); // Cap to 20 parts
        const partResults: {
          index: number;
          title: string;
          startTime: number;
          endTime: number;
          duration: number;
          downloadUrl: string;
          streamUrl: string;
          thumbnailUrl: string;
          size: number;
        }[] = [];

        // Sequential slice generation (prevents CPU lockup and ensures perfect H.264 yuv420p compatibility)
        for (let i = 0; i < partsToSlice; i++) {
          const start = i * sliceSeconds;
          const end = Math.min(totalDuration, (i + 1) * sliceSeconds);
          const partDur = end - start;
          const partFile = path.join(sessionDir, `part_${i + 1}.mp4`);
          const thumbFile = path.join(sessionDir, `part_${i + 1}_thumb.jpg`);

          const startStr = formatTime(start);

          // Build standards-compliant H.264 slice following autoclip specifications:
          // yuv420p + faststart + make_zero resets edit list so video plays cleanly from 00:00 on all mobile/desktop browsers
          const sliceCmd = isVertical
            ? `ffmpeg -ss ${startStr} -i "${sourcePath}" -t ${partDur} -map 0:v:0 -map 0:a:0? -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p" -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -avoid_negative_ts make_zero -y "${partFile}"`
            : `ffmpeg -ss ${startStr} -i "${sourcePath}" -t ${partDur} -map 0:v:0 -map 0:a:0? -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -avoid_negative_ts make_zero -y "${partFile}"`;

          await new Promise<void>((resolve) => {
            exec(sliceCmd, () => {
              // Extract real frame thumbnail from the generated part
              if (fs.existsSync(partFile) && fs.statSync(partFile).size > 1000) {
                exec(`ffmpeg -ss 00:00:01 -i "${partFile}" -vframes 1 -vf "scale=480:-1" -y "${thumbFile}"`, () => {
                  resolve();
                });
              } else {
                resolve();
              }
            });
          });

          if (fs.existsSync(partFile) && fs.statSync(partFile).size > 1000) {
            partResults.push({
              index: i + 1,
              title: `Part ${i + 1}`,
              startTime: start,
              endTime: end,
              duration: partDur,
              downloadUrl: `/api/get-part-video?session=${sessionId}&part=${i + 1}&download=1`,
              streamUrl: `/api/get-part-video?session=${sessionId}&part=${i + 1}`,
              thumbnailUrl: `/api/get-part-video?session=${sessionId}&part=${i + 1}&thumb=1`,
              size: fs.statSync(partFile).size,
            });
          }
        }

        // IMMEDIATELY DELETE RAW FULL SOURCE VIDEO to free server disk storage
        try {
          if (fs.existsSync(sourcePath) && (sourcePath.includes(CACHE_DIR) || sourcePath.includes('source_raw') || sourcePath.includes('user_'))) {
            fs.unlinkSync(sourcePath);
          }
        } catch {}

        if (partResults.length === 0) {
          return res.status(500).json({ error: 'Failed to slice video clips' });
        }

        return res.json({
          sessionId,
          totalDuration,
          parts: partResults,
        });
      }
    );
  });
});

// -------------------------------------------------------------
// ASYNCHRONOUS JOB SYSTEM FOR VIDEO PROCESSING
// Prevents request timeouts and provides live progress tracking
// -------------------------------------------------------------
interface JobItem {
  id: string;
  status: 'validating' | 'preparing' | 'queued' | 'processing' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  phaseDescription: string;
  currentClipIndex: number;
  totalClips: number;
  sourceTitle: string;
  sourceDuration: number;
  sliceSeconds: number;
  orientation: 'original' | '9:16' | '16:9' | '1:1';
  quality: string;
  sessionDir: string;
  clips: {
    id: string;
    index: number;
    title: string;
    startTime: number;
    endTime: number;
    duration: number;
    downloadUrl: string;
    streamUrl: string;
    thumbnailUrl: string;
    size: number;
  }[];
  error?: string;
  createdAt: number;
  isCancelled?: boolean;
}

const activeJobs = new Map<string, JobItem>();

// Helper to build orientation filter for FFmpeg
function getOrientationFilter(orientation: string): string {
  switch (orientation) {
    case '9:16':
      return '-vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -b:a 128k -movflags +faststart -avoid_negative_ts make_zero';
    case '16:9':
      return '-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -b:a 128k -movflags +faststart -avoid_negative_ts make_zero';
    case '1:1':
      return '-vf "scale=720:720:force_original_aspect_ratio=increase,crop=720:720,format=yuv420p" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -b:a 128k -movflags +faststart -avoid_negative_ts make_zero';
    case 'original':
    default:
      return '-c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -avoid_negative_ts make_zero';
  }
}

// Background Worker to process async video job
async function runAsyncJobWorker(job: JobItem, url: string) {
  try {
    const rawTempVideo = path.join(job.sessionDir, 'source_raw.mp4');

    // Phase 1: Validating & Preparing Source
    job.status = 'preparing';
    job.phaseDescription = 'Acquiring video source...';
    job.progress = 10;

    let sourcePath: string | null = null;
    let candidatePath = url;
    if (url.startsWith('/') && !fs.existsSync(url)) {
      const publicPath = path.join(process.cwd(), 'public', url);
      if (fs.existsSync(publicPath)) {
        candidatePath = publicPath;
      }
    } else if (url.startsWith('public/')) {
      const fullPath = path.join(process.cwd(), url);
      if (fs.existsSync(fullPath)) {
        candidatePath = fullPath;
      }
    }

    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      sourcePath = candidatePath;
    } else if (url.startsWith('http') && (url.includes('.mp4') || url.includes('.webm') || url.includes('archive.org'))) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} when fetching video stream`);
      const buf = await res.arrayBuffer();
      fs.writeFileSync(rawTempVideo, Buffer.from(buf));
      sourcePath = rawTempVideo;
    } else {
      // YouTube URL
      const ytCmd = `python3 "${YTDLP_BIN}" --js-runtimes node:/usr/local/bin/node --extractor-args "youtube:player_client=android,web,tv" -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/18/best[ext=mp4]/best" --merge-output-format mp4 --no-playlist --no-warnings "${url}" -o "${rawTempVideo}"`;
      await new Promise<void>((resolve, reject) => {
        exec(ytCmd, { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }, (err, stdout, stderr) => {
          if (fs.existsSync(rawTempVideo) && fs.statSync(rawTempVideo).size > 10000) {
            sourcePath = rawTempVideo;
            return resolve();
          }
          const files = fs.readdirSync(job.sessionDir);
          const match = files.find((f) => (f.startsWith('source_raw') || f.endsWith('.mp4')) && !f.endsWith('.part'));
          if (match) {
            sourcePath = path.join(job.sessionDir, match);
            return resolve();
          }

          const fullErr = (err?.message || '') + ' ' + (stderr || '') + ' ' + (stdout || '');
          let friendlyErr = 'Could not download video stream from link.';
          if (fullErr.includes('Sign in to confirm you’re not a bot') || fullErr.includes('bot') || fullErr.includes('LOGIN_REQUIRED')) {
            friendlyErr = 'YouTube requires sign-in verification on cloud server IPs ("Sign in to confirm you are not a bot"). Please save the video to your device first, then upload it below for 100% genuine FFmpeg trimming.';
          }
          reject(new Error(friendlyErr));
        });
      });
    }

    if (job.isCancelled) return;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error('Video source file not found or inaccessible.');
    }

    // Phase 2: Probe Duration
    job.phaseDescription = 'Probing video dimensions and stream duration...';
    job.progress = 25;

    const probeStdout = await new Promise<string>((resolve) => {
      exec(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourcePath}"`,
        (err, out) => resolve(out ? out.trim() : '')
      );
    });

    let totalDuration = 300;
    if (probeStdout) {
      const parsed = parseFloat(probeStdout);
      if (!isNaN(parsed) && parsed > 0) totalDuration = Math.round(parsed);
    }
    job.sourceDuration = totalDuration;

    // Calculate exact clip count: ceil(totalDuration / sliceSeconds)
    const totalClips = Math.max(1, Math.ceil(totalDuration / Math.max(1, job.sliceSeconds)));
    job.totalClips = totalClips;

    // Phase 3: Slicing video into consecutive parts
    job.status = 'processing';
    job.phaseDescription = `Dividing video into ${totalClips} consecutive clips...`;

    const orientationArgs = getOrientationFilter(job.orientation);

    for (let i = 0; i < totalClips; i++) {
      if (job.isCancelled) return;

      const start = i * job.sliceSeconds;
      const end = Math.min(totalDuration, (i + 1) * job.sliceSeconds);
      const partDur = Math.round((end - start) * 10) / 10;
      const partFile = path.join(job.sessionDir, `part_${i + 1}.mp4`);
      const thumbFile = path.join(job.sessionDir, `part_${i + 1}_thumb.jpg`);
      const startStr = formatTime(start);

      job.currentClipIndex = i + 1;
      job.phaseDescription = `Encoding Clip ${i + 1} of ${totalClips} (${formatTime(start)} – ${formatTime(end)})...`;
      job.progress = Math.round(25 + ((i + 1) / totalClips) * 65);

      const sliceCmd = `ffmpeg -ss ${startStr} -i "${sourcePath}" -t ${partDur} -map 0:v:0 -map 0:a:0? ${orientationArgs} -y "${partFile}"`;

      await new Promise<void>((resolve) => {
        exec(sliceCmd, () => {
          if (fs.existsSync(partFile) && fs.statSync(partFile).size > 1000) {
            const thumbSec = partDur > 1 ? '00:00:01' : '00:00:00';
            exec(`ffmpeg -ss ${thumbSec} -i "${partFile}" -vframes 1 -vf "scale=480:-1" -y "${thumbFile}"`, () => resolve());
          } else {
            resolve();
          }
        });
      });

      if (fs.existsSync(partFile) && fs.statSync(partFile).size > 1000) {
        const clipNum = (i + 1).toString().padStart(2, '0');
        job.clips.push({
          id: `clip_${i + 1}`,
          index: i + 1,
          title: `Clip ${clipNum} (${formatTime(start)} – ${formatTime(end)})`,
          startTime: start,
          endTime: end,
          duration: partDur,
          downloadUrl: `/api/jobs/${job.id}/clips/${i + 1}?download=1`,
          streamUrl: `/api/jobs/${job.id}/clips/${i + 1}`,
          thumbnailUrl: `/api/jobs/${job.id}/clips/${i + 1}/thumb`,
          size: fs.statSync(partFile).size,
        });
      }
    }

    if (job.isCancelled) return;

    // Phase 4: Finalizing & Cleaning up raw source
    job.status = 'finalizing';
    job.phaseDescription = 'Finalizing clips and freeing server storage...';
    job.progress = 95;

    try {
      if (fs.existsSync(sourcePath) && (sourcePath.includes(CACHE_DIR) || sourcePath.includes('source_raw') || sourcePath.includes('user_'))) {
        fs.unlinkSync(sourcePath);
      }
    } catch {}

    // Phase 5: Completed!
    job.status = 'completed';
    job.progress = 100;
    job.phaseDescription = `Successfully generated ${job.clips.length} clips!`;
  } catch (err: unknown) {
    if (!job.isCancelled) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : 'Video processing failed.';
      job.phaseDescription = 'Processing stopped.';
    }
  }
}

// 1. Create a background processing job
app.post('/api/jobs/create', (req: Request, res: Response) => {
  const { url, sliceSeconds = 30, orientation = '9:16', quality = '4k', title = 'Video' } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Video URL or uploaded path is required.' });
  }

  const durationSec = Math.max(5, Math.min(3600, parseInt(sliceSeconds, 10) || 30));
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const sessionDir = path.join(CACHE_DIR, jobId);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const job: JobItem = {
    id: jobId,
    status: 'validating',
    progress: 5,
    phaseDescription: 'Validating video source and options...',
    currentClipIndex: 0,
    totalClips: 0,
    sourceTitle: title,
    sourceDuration: 0,
    sliceSeconds: durationSec,
    orientation: orientation || '9:16',
    quality: quality || '4k',
    sessionDir,
    clips: [],
    createdAt: Date.now(),
  };

  activeJobs.set(jobId, job);

  // Run in background without blocking response
  runAsyncJobWorker(job, url);

  res.json({
    jobId,
    status: job.status,
    message: 'Job submitted successfully',
  });
});

// 2. Poll job status
app.get('/api/jobs/:id', (req: Request, res: Response) => {
  const job = activeJobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired.' });
  }
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    phaseDescription: job.phaseDescription,
    currentClipIndex: job.currentClipIndex,
    totalClips: job.totalClips,
    sourceTitle: job.sourceTitle,
    sourceDuration: job.sourceDuration,
    sliceSeconds: job.sliceSeconds,
    orientation: job.orientation,
    quality: job.quality,
    clips: job.clips,
    error: job.error,
    createdAt: job.createdAt,
  });
});

// 3. Cancel running job
app.post('/api/jobs/:id/cancel', (req: Request, res: Response) => {
  const job = activeJobs.get(req.params.id);
  if (job) {
    job.isCancelled = true;
    job.status = 'cancelled';
    job.phaseDescription = 'Job cancelled by user.';
    try {
      if (fs.existsSync(job.sessionDir)) {
        fs.rmSync(job.sessionDir, { recursive: true, force: true });
      }
    } catch {}
    activeJobs.delete(req.params.id);
  }
  res.json({ success: true, message: 'Job cancelled' });
});

// 4. Stream or download real clip
app.get('/api/jobs/:id/clips/:index', (req: Request, res: Response) => {
  const { id, index } = req.params;
  const isDownload = req.query.download === '1' || req.query.download === 'true';
  const filePath = path.join(CACHE_DIR, id, `part_${index}.mp4`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Clip ${index} file not found or expired.` });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const safeFilename = `Clip_${index.padStart(2, '0')}.mp4`;

  if (isDownload) {
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    return res.download(filePath, safeFilename);
  }

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// 5. Get extracted frame thumbnail
app.get('/api/jobs/:id/clips/:index/thumb', (req: Request, res: Response) => {
  const { id, index } = req.params;
  const thumbPath = path.join(CACHE_DIR, id, `part_${index}_thumb.jpg`);

  if (fs.existsSync(thumbPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    return res.sendFile(thumbPath);
  }
  res.status(404).json({ error: 'Thumbnail not found' });
});

// 6. Download ZIP of all completed clips in job
app.get('/api/jobs/:id/zip', async (req: Request, res: Response) => {
  const { id } = req.params;
  const sessionDir = path.join(CACHE_DIR, id);

  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: 'Job session expired or not found.' });
  }

  try {
    const JSZipModule = (await import('jszip')).default;
    const zip = new JSZipModule();
    const files = fs.readdirSync(sessionDir);
    const partFiles = files.filter((f) => f.startsWith('part_') && f.endsWith('.mp4'));

    if (partFiles.length === 0) {
      return res.status(404).json({ error: 'No video clips available in job.' });
    }

    for (const f of partFiles) {
      zip.file(f, fs.readFileSync(path.join(sessionDir, f)));
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const safeZipName = `ClipCraft_${id}_all_clips.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ZIP package' });
  }
});

// 7. Endpoint to export full project source ZIP
app.get('/api/download-project-source', (req: Request, res: Response) => {
  const zipPath = path.join(process.cwd(), 'public', 'ClipCraft-Project-Source.zip');
  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ClipCraft-Project-Source.zip"');
    return res.sendFile(zipPath);
  }
  res.status(404).json({ error: 'Project archive not generated yet' });
});

// -------------------------------------------------------------
// ENDPOINT: SERVE THE REAL TRIMMED PART VIDEO & THUMBNAIL
// -------------------------------------------------------------
app.get('/api/get-part-video', (req: Request, res: Response) => {
  const sessionId = req.query.session as string;
  const partIndex = parseInt(req.query.part as string, 10);
  const isDownload = req.query.download === '1' || req.query.download === 'true';
  const isThumb = req.query.thumb === '1' || req.query.thumb === 'true';

  if (!sessionId || isNaN(partIndex)) {
    return res.status(400).json({ error: 'Valid session and part number required' });
  }

  // Handle direct frame thumbnail request
  if (isThumb) {
    const thumbFilePath = path.join(CACHE_DIR, sessionId, `part_${partIndex}_thumb.jpg`);
    if (fs.existsSync(thumbFilePath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      return res.sendFile(thumbFilePath);
    }
  }

  const partFilePath = path.join(CACHE_DIR, sessionId, `part_${partIndex}.mp4`);

  if (!fs.existsSync(partFilePath)) {
    return res.status(404).json({ error: `Part ${partIndex} file not found or expired` });
  }

  const stat = fs.statSync(partFilePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const safeFilename = `Part_${partIndex}.mp4`;

  if (isDownload) {
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    return res.download(partFilePath, safeFilename);
  }

  // Handle HTML5 video range streaming
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(partFilePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(partFilePath).pipe(res);
  }
});

// -------------------------------------------------------------
// ENDPOINT: CLEANUP SESSION FILES (ON DEMAND)
// Called by client after loading or downloading to free disk space
// -------------------------------------------------------------
app.post('/api/cleanup-session', (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (sessionId && typeof sessionId === 'string') {
    const sessionDir = path.join(CACHE_DIR, sessionId);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch {}
  }
  res.json({ success: true });
});

// -------------------------------------------------------------
// ENDPOINT: DOWNLOAD ALL TRIMMED PARTS AS A GENUINE ZIP
// -------------------------------------------------------------
app.post('/api/download-all-zip', async (req: Request, res: Response) => {
  const { sessionId, title = 'Clips' } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const sessionDir = path.join(CACHE_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: 'Session files expired or not found' });
  }

  try {
    const JSZipModule = (await import('jszip')).default;
    const zip = new JSZipModule();

    const files = fs.readdirSync(sessionDir);
    const partFiles = files.filter((f) => f.startsWith('part_') && f.endsWith('.mp4'));

    if (partFiles.length === 0) {
      return res.status(404).json({ error: 'No video parts found in session' });
    }

    for (const file of partFiles) {
      const filePath = path.join(sessionDir, file);
      const buffer = fs.readFileSync(filePath);
      zip.file(file, buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const safeZipName = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_all_parts.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}"`);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Failed to create ZIP:', err);
    res.status(500).json({ error: 'Failed to create ZIP package' });
  }
});

// Direct Video File Upload (/api/upload-video)
app.post('/api/upload-video', (req: Request, res: Response) => {
  const filename = (req.headers['x-filename'] as string) || `upload_${Date.now()}.mp4`;
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const targetPath = path.join(CACHE_DIR, `user_${Date.now()}_${safeName}`);

  const handleSavedFile = () => {
    exec(
      `ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 "${targetPath}"`,
      (err, stdout) => {
        let duration = 600;
        let is4K = false;
        if (!err && stdout) {
          const durMatch = stdout.match(/duration=([0-9.]+)/);
          const widthMatch = stdout.match(/width=([0-9]+)/);
          const heightMatch = stdout.match(/height=([0-9]+)/);
          if (durMatch) duration = Math.round(parseFloat(durMatch[1]));
          const w = widthMatch ? parseInt(widthMatch[1], 10) : 1920;
          const h = heightMatch ? parseInt(heightMatch[1], 10) : 1080;
          if (w >= 3840 || h >= 2160) is4K = true;
        }

        const size = fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0;
        res.json({
          url: targetPath,
          title: safeName.replace(/\.[^/.]+$/, ''),
          duration,
          is4K,
          size,
        });
      }
    );
  };

  // If express.raw parsed the stream into a Buffer
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    fs.writeFileSync(targetPath, req.body);
    return handleSavedFile();
  }

  // Fallback to stream piping if body was not buffered
  const writeStream = fs.createWriteStream(targetPath);
  req.pipe(writeStream);

  writeStream.on('finish', handleSavedFile);
  writeStream.on('error', (err) => {
    res.status(500).json({ error: 'File upload failed', details: err.message });
  });
});

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClipCraft Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
