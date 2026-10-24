import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

const YTDLP_PATH = path.resolve(process.cwd(), 'bin', 'yt-dlp');

// 1. Endpoint: Get YouTube Video Info
app.get('/api/video-info', async (req: Request, res: Response) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // If local binary doesn't exist, fallback
  if (!fs.existsSync(YTDLP_PATH)) {
    return res.status(500).json({ error: 'yt-dlp binary not found' });
  }

  execFile(
    YTDLP_PATH,
    ['--skip-download', '--dump-json', '--no-warnings', videoUrl],
    { maxBuffer: 10 * 1024 * 1024 },
    (error, stdout, stderr) => {
      if (error) {
        console.error('yt-dlp error:', stderr);
        return res.status(500).json({ error: 'Failed to extract video information' });
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

// 2. Endpoint: Download & Trim Real Video Segment
app.get('/api/download-clip', async (req: Request, res: Response) => {
  const videoUrl = req.query.url as string;
  const startSec = parseFloat(req.query.start as string) || 0;
  const endSec = parseFloat(req.query.end as string) || 30;
  const quality = (req.query.quality as string) || '4k';
  const format = (req.query.format as string) || 'youtube';
  const title = (req.query.title as string) || 'clip';

  if (!videoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const duration = Math.max(1, endSec - startSec);
  const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${quality}.mp4`;

  // Format filter for yt-dlp
  let formatSelector = 'bestvideo[height<=2160]+bestaudio/best';
  if (quality === '1080p') {
    formatSelector = 'bestvideo[height<=1080]+bestaudio/best';
  } else if (quality === '720p') {
    formatSelector = 'bestvideo[height<=720]+bestaudio/best';
  }

  // Temp output path
  const tmpDir = os.tmpdir();
  const rawOutputFile = path.join(tmpDir, `raw_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
  const finalOutputFile = path.join(tmpDir, `final_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);

  // Section time format HH:MM:SS
  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const sectionArg = `*${formatTime(startSec)}-${formatTime(endSec)}`;

  // Download section with yt-dlp
  const ytdlpArgs = [
    '-f', formatSelector,
    '--download-sections', sectionArg,
    '--force-keyframes-at-cuts',
    videoUrl,
    '-o', rawOutputFile,
  ];

  console.log(`Starting yt-dlp clip download: ${sectionArg} for ${videoUrl}`);

  execFile(YTDLP_PATH, ytdlpArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err || !fs.existsSync(rawOutputFile)) {
      console.warn('Direct section download failed, trying standard fallback stream...');
      return res.status(500).json({ error: 'Failed to download YouTube section' });
    }

    // If format is vertical shorts (9:16), apply crop filter via ffmpeg
    const isVertical = format === 'shorts' || format === 'tiktok';

    if (isVertical) {
      // ffmpeg crop 9:16 centered
      // crop=ih*9/16:ih:(iw-ow)/2:0
      const ffmpegArgs = [
        '-i', rawOutputFile,
        '-vf', 'crop=ih*9/16:ih',
        '-c:a', 'copy',
        '-y',
        finalOutputFile,
      ];

      execFile('/usr/bin/ffmpeg', ffmpegArgs, (ffErr) => {
        const fileToSend = !ffErr && fs.existsSync(finalOutputFile) ? finalOutputFile : rawOutputFile;

        res.download(fileToSend, safeFilename, (dErr) => {
          // Cleanup
          try { if (fs.existsSync(rawOutputFile)) fs.unlinkSync(rawOutputFile); } catch {}
          try { if (fs.existsSync(finalOutputFile)) fs.unlinkSync(finalOutputFile); } catch {}
        });
      });
    } else {
      res.download(rawOutputFile, safeFilename, (dErr) => {
        // Cleanup
        try { if (fs.existsSync(rawOutputFile)) fs.unlinkSync(rawOutputFile); } catch {}
      });
    }
  });
});

async function startServer() {
  // Vite dev middleware
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
