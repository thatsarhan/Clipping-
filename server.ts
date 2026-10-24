import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { execFile, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

const YTDLP_PATH = '/usr/local/bin/yt-dlp';
const CACHE_DIR = path.join(os.tmpdir(), 'clipcraft_cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// 1. Endpoint: Get YouTube Video Info
app.get('/api/video-info', async (req: Request, res: Response) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  execFile(
    YTDLP_PATH,
    ['--skip-download', '--dump-json', '--no-warnings', videoUrl],
    { maxBuffer: 10 * 1024 * 1024 },
    (error, stdout, stderr) => {
      if (error) {
        console.error('yt-dlp info error:', stderr);
        return res.status(500).json({ error: 'Failed to extract video info' });
      }

      try {
        const data = JSON.parse(stdout);
        const is4K = (data.height && data.height >= 2160) || (data.width && data.width >= 3840);
        return res.json({
          id: data.id,
          title: data.title || 'YouTube Video',
          author: data.uploader || data.channel || 'YouTube Creator',
          duration: Math.round(data.duration || 600),
          thumbnailUrl: data.thumbnail,
          resolution: is4K ? '4K Ultra HD (2160p)' : `${data.height || 1080}p`,
          is4K: !!is4K,
          webpage_url: data.webpage_url || videoUrl,
        });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse video info' });
      }
    }
  );
});

// Helper to prepare or retrieve a real clipped MP4 file
function prepareClipFile(
  videoUrl: string,
  startSec: number,
  endSec: number,
  quality: string,
  format: string,
  callback: (err: Error | null, filePath: string | null) => void
) {
  const isVertical = format === 'shorts' || format === 'tiktok' || format === 'instagram';
  const urlHash = Buffer.from(videoUrl).toString('hex').slice(0, 16);
  const cacheKey = `${urlHash}_${Math.round(startSec)}_${Math.round(endSec)}_${isVertical ? '9x16' : '16x9'}_${quality}.mp4`;
  const cachedFilePath = path.join(CACHE_DIR, cacheKey);

  // If already generated and valid (>50KB), return cached file!
  if (fs.existsSync(cachedFilePath) && fs.statSync(cachedFilePath).size > 50000) {
    return callback(null, cachedFilePath);
  }

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const sectionArg = `*${formatTime(startSec)}-${formatTime(endSec)}`;

  // If direct mp4 or sample video
  if (videoUrl.includes('.mp4') || videoUrl.includes('commondatastorage.googleapis.com')) {
    const ffmpegArgs = [
      '-ss', formatTime(startSec),
      '-to', formatTime(endSec),
      '-i', videoUrl,
      ...(isVertical ? ['-vf', 'crop=ih*9/16:ih'] : []),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-y',
      cachedFilePath,
    ];

    execFile('/usr/bin/ffmpeg', ffmpegArgs, (ffErr) => {
      if (ffErr || !fs.existsSync(cachedFilePath) || fs.statSync(cachedFilePath).size < 10000) {
        return callback(ffErr || new Error('FFmpeg failed'), null);
      }
      callback(null, cachedFilePath);
    });
    return;
  }

  // YouTube Videos: download the exact section directly into MP4
  const rawTemp = path.join(CACHE_DIR, `raw_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

  const cmd = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --download-sections "${sectionArg}" "${videoUrl}" -o "${rawTemp}"`;

  console.log(`Executing real YouTube clip download: ${cmd}`);

  exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    // Find output file (yt-dlp may name it rawTemp or rawTemp.mp4 or rawTemp.webm)
    let candidateFile: string | null = null;

    if (fs.existsSync(rawTemp) && fs.statSync(rawTemp).size > 10000) {
      candidateFile = rawTemp;
    } else {
      // Look for any file starting with rawTemp prefix
      const dirFiles = fs.readdirSync(CACHE_DIR);
      const matched = dirFiles.find((f) => f.startsWith(path.basename(rawTemp)));
      if (matched) {
        const full = path.join(CACHE_DIR, matched);
        if (fs.statSync(full).size > 10000) {
          candidateFile = full;
        }
      }
    }

    if (!candidateFile) {
      console.error('yt-dlp did not produce valid video file:', stderr);
      return callback(new Error('Failed to download video stream'), null);
    }

    // If vertical format requested (Shorts / TikTok)
    if (isVertical) {
      const cropCmd = `ffmpeg -i "${candidateFile}" -vf "crop=ih*9/16:ih" -c:v libx264 -preset ultrafast -c:a copy -movflags +faststart -y "${cachedFilePath}"`;
      exec(cropCmd, (cErr) => {
        try { fs.unlinkSync(candidateFile!); } catch {}
        if (cErr || !fs.existsSync(cachedFilePath) || fs.statSync(cachedFilePath).size < 10000) {
          // If crop failed, fallback to uncropped file
          fs.renameSync(candidateFile!, cachedFilePath);
        }
        callback(null, cachedFilePath);
      });
    } else {
      fs.rename(candidateFile, cachedFilePath, (rErr) => {
        if (rErr) return callback(rErr, null);
        callback(null, cachedFilePath);
      });
    }
  });
}

// 2. Endpoint: Stream Native MP4 Video Segment (<video controls src="/api/stream-clip?...">)
app.get('/api/stream-clip', (req: Request, res: Response) => {
  const videoUrl = req.query.url as string;
  const startSec = parseFloat(req.query.start as string) || 0;
  const endSec = parseFloat(req.query.end as string) || 30;
  const quality = (req.query.quality as string) || '4k';
  const format = (req.query.format as string) || 'shorts';

  if (!videoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  prepareClipFile(videoUrl, startSec, endSec, quality, format, (err, filePath) => {
    if (err || !filePath || !fs.existsSync(filePath)) {
      console.warn('Stream clip failed:', err);
      return res.status(500).json({ error: 'Video stream processing failed' });
    }

    res.sendFile(filePath, {
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      },
    });
  });
});

// 3. Endpoint: Download Real MP4 Video Segment (Download Part X button & 3 dots download)
app.get('/api/download-clip', (req: Request, res: Response) => {
  const videoUrl = req.query.url as string;
  const startSec = parseFloat(req.query.start as string) || 0;
  const endSec = parseFloat(req.query.end as string) || 30;
  const quality = (req.query.quality as string) || '4k';
  const format = (req.query.format as string) || 'shorts';
  const title = (req.query.title as string) || 'clip';

  if (!videoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${quality}.mp4`;

  prepareClipFile(videoUrl, startSec, endSec, quality, format, (err, filePath) => {
    if (err || !filePath || !fs.existsSync(filePath)) {
      console.error('Download clip failed:', err);
      return res.status(500).json({ error: 'Failed to download real video' });
    }

    // Set correct headers so browser downloads real MP4 video
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.download(filePath, safeFilename);
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
