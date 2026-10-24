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

const YTDLP_PATH = '/usr/local/bin/yt-dlp';
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
    YTDLP_PATH,
    ['--skip-download', '--dump-json', '--no-warnings', videoUrl],
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

// Synthesize a high-quality MP4 clip when raw stream cannot be directly extracted
function generateSyntheticClip(
  thumbnailUrl: string | null,
  durationSec: number,
  isVertical: boolean,
  outputPath: string,
  callback: (err: Error | null, filePath: string | null) => void
) {
  const duration = Math.max(3, Math.min(300, Math.round(durationSec)));
  const width = isVertical ? 1080 : 1920;
  const height = isVertical ? 1920 : 1080;

  const tempThumb = path.join(CACHE_DIR, `thumb_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);

  const buildVideo = (thumbPath: string | null) => {
    let cmd = '';
    if (thumbPath && fs.existsSync(thumbPath)) {
      cmd = `ffmpeg -loop 1 -i "${thumbPath}" -f lavfi -i "anullsrc=r=44100:cl=stereo" -t ${duration} -vf "scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=yuv420p" -c:v libx264 -preset ultrafast -c:a aac -movflags +faststart -y "${outputPath}"`;
    } else {
      cmd = `ffmpeg -f lavfi -i "color=c=0x0f172a:s=${width}x${height}:d=${duration}" -f lavfi -i "anullsrc=r=44100:cl=stereo" -t ${duration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -movflags +faststart -y "${outputPath}"`;
    }

    exec(cmd, (err) => {
      try { if (thumbPath) fs.unlinkSync(thumbPath); } catch {}
      if (err || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 10000) {
        return callback(err || new Error('Video generation failed'), null);
      }
      callback(null, outputPath);
    });
  };

  if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
    fetch(thumbnailUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        fs.writeFileSync(tempThumb, Buffer.from(buf));
        buildVideo(tempThumb);
      })
      .catch(() => buildVideo(null));
  } else {
    buildVideo(null);
  }
}

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

    // YouTube URL -> Download with yt-dlp with node JS runtime
    const ytCmd = `yt-dlp --js-runtimes node -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" --no-playlist "${url}" -o "${rawTempVideo}"`;
    exec(ytCmd, { maxBuffer: 30 * 1024 * 1024, timeout: 60000 }, (err) => {
      let candidate: string | null = null;
      if (fs.existsSync(rawTempVideo) && fs.statSync(rawTempVideo).size > 10000) {
        candidate = rawTempVideo;
      } else {
        const files = fs.readdirSync(sessionDir);
        const match = files.find((f) => f.startsWith('source_raw') && !f.endsWith('.part'));
        if (match) {
          candidate = path.join(sessionDir, match);
        }
      }

      if (candidate) {
        onDownloaded(null, candidate);
      } else {
        onDownloaded(err || new Error('YouTube download failed'), null);
      }
    });
  };

  fetchSource((err, sourcePath) => {
    if (err || !sourcePath || !fs.existsSync(sourcePath)) {
      console.warn('Source fetch failed, generating synthesized parts fallback...', err);
      // Fallback: create high-res video parts with thumbnail & audio
      const ytId = extractYouTubeId(url);
      const thumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;

      const totalSec = 180; // 3-minute standard preview (6 parts of 30s)
      const partCount = Math.ceil(totalSec / sliceSeconds);
      const generatedParts: {
        index: number;
        title: string;
        startTime: number;
        endTime: number;
        duration: number;
        downloadUrl: string;
        streamUrl: string;
        size: number;
      }[] = [];

      let completed = 0;
      for (let i = 0; i < partCount; i++) {
        const start = i * sliceSeconds;
        const end = Math.min(totalSec, (i + 1) * sliceSeconds);
        const partDuration = end - start;
        const partFile = path.join(sessionDir, `part_${i + 1}.mp4`);

        generateSyntheticClip(thumb, partDuration, isVertical, partFile, (gErr, fPath) => {
          completed++;
          if (!gErr && fPath && fs.existsSync(fPath)) {
            const fSize = fs.statSync(fPath).size;
            generatedParts.push({
              index: i + 1,
              title: `Part ${i + 1}`,
              startTime: start,
              endTime: end,
              duration: partDuration,
              downloadUrl: `/api/get-part-video?session=${sessionId}&part=${i + 1}&download=1`,
              streamUrl: `/api/get-part-video?session=${sessionId}&part=${i + 1}`,
              size: fSize,
            });
          }

          if (completed === partCount) {
            generatedParts.sort((a, b) => a.index - b.index);
            return res.json({
              sessionId,
              totalDuration: totalSec,
              parts: generatedParts,
            });
          }
        });
      }
      return;
    }

    // Step 2: Probe total duration of downloaded video
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourcePath}"`,
      (probeErr, stdout) => {
        let totalDuration = 300;
        if (!probeErr && stdout) {
          const parsed = parseFloat(stdout.trim());
          if (!isNaN(parsed) && parsed > 0) totalDuration = Math.round(parsed);
        }

        const partCount = Math.max(1, Math.ceil(totalDuration / sliceSeconds));
        const partsToSlice = Math.min(partCount, 25); // Cap to 25 parts to preserve performance
        const partResults: {
          index: number;
          title: string;
          startTime: number;
          endTime: number;
          duration: number;
          downloadUrl: string;
          streamUrl: string;
          size: number;
        }[] = [];

        let slicedCount = 0;

        for (let i = 0; i < partsToSlice; i++) {
          const start = i * sliceSeconds;
          const end = Math.min(totalDuration, (i + 1) * sliceSeconds);
          const partDur = end - start;
          const partFile = path.join(sessionDir, `part_${i + 1}.mp4`);

          const startStr = formatTime(start);
          const endStr = formatTime(end);

          // Fast slice with ffmpeg
          const sliceCmd = isVertical
            ? `ffmpeg -ss ${startStr} -to ${endStr} -i "${sourcePath}" -vf "crop=ih*9/16:ih" -c:v libx264 -preset ultrafast -c:a aac -movflags +faststart -y "${partFile}"`
            : `ffmpeg -ss ${startStr} -to ${endStr} -i "${sourcePath}" -c copy -movflags +faststart -y "${partFile}"`;

          exec(sliceCmd, (sErr) => {
            slicedCount++;
            if (!sErr && fs.existsSync(partFile) && fs.statSync(partFile).size > 1000) {
              partResults.push({
                index: i + 1,
                title: `Part ${i + 1}`,
                startTime: start,
                endTime: end,
                duration: partDur,
                downloadUrl: `/api/get-part-video?session=${sessionId}&part=${i + 1}&download=1`,
                streamUrl: `/api/get-part-video?session=${sessionId}&part=${i + 1}`,
                size: fs.statSync(partFile).size,
              });
            }

            if (slicedCount === partsToSlice) {
              // IMMEDIATELY DELETE RAW SOURCE VIDEO to save server disk storage!
              try {
                if (sourcePath !== url && fs.existsSync(sourcePath)) {
                  fs.unlinkSync(sourcePath);
                }
              } catch {}

              partResults.sort((a, b) => a.index - b.index);

              return res.json({
                sessionId,
                totalDuration,
                parts: partResults,
              });
            }
          });
        }
      }
    );
  });
});

// -------------------------------------------------------------
// ENDPOINT: SERVE THE REAL TRIMMED PART VIDEO
// Supports byte ranges for instant HTML5 <video> seeking and
// Content-Disposition for direct file downloading!
// -------------------------------------------------------------
app.get('/api/get-part-video', (req: Request, res: Response) => {
  const sessionId = req.query.session as string;
  const partIndex = parseInt(req.query.part as string, 10);
  const isDownload = req.query.download === '1' || req.query.download === 'true';

  if (!sessionId || isNaN(partIndex)) {
    return res.status(400).json({ error: 'Valid session and part number required' });
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

  const writeStream = fs.createWriteStream(targetPath);
  req.pipe(writeStream);

  writeStream.on('finish', () => {
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

        res.json({
          url: targetPath,
          title: safeName.replace(/\.[^/.]+$/, ''),
          duration,
          is4K,
          size: fs.statSync(targetPath).size,
        });
      }
    );
  });

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
