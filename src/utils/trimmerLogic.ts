import { ClipSegment } from '../types/trimmer';

/**
 * Extracts YouTube video ID from various URL patterns
 */
export function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  // Handle direct 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex for standard formats:
  // - youtube.com/watch?v=VIDEO_ID
  // - youtu.be/VIDEO_ID
  // - youtube.com/embed/VIDEO_ID
  // - youtube.com/v/VIDEO_ID
  // - youtube.com/shorts/VIDEO_ID
  // - youtube.com/live/VIDEO_ID
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Formats seconds into HH:MM:SS or MM:SS
 */
export function formatTimestamp(seconds: number, includeMs = false): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;

  const totalSecs = Math.floor(seconds);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const ms = Math.floor((seconds - totalSecs) * 10);

  const mm = minutes.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');

  let base = '';
  if (hours > 0) {
    const hh = hours.toString().padStart(2, '0');
    base = `${hh}:${mm}:${ss}`;
  } else {
    base = `${mm}:${ss}`;
  }

  if (includeMs) {
    return `${base}.${ms}`;
  }
  return base;
}

/**
 * Parses timestamp string "MM:SS", "HH:MM:SS", or "SS" into seconds
 */
export function parseTimestamp(str: string): number {
  if (!str) return 0;
  const cleaned = str.trim();

  // Try pure seconds
  if (!cleaned.includes(':')) {
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : Math.max(0, val);
  }

  const parts = cleaned.split(':').map((p) => parseFloat(p));
  if (parts.some((p) => isNaN(p))) return 0;

  if (parts.length === 2) {
    // MM:SS
    return Math.max(0, parts[0] * 60 + parts[1]);
  } else if (parts.length === 3) {
    // HH:MM:SS
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  return 0;
}

/**
 * Accurately calculates clip count based on formula:
 * clipCount = ceil(videoDurationSeconds / clipDurationSeconds)
 */
export function calculateClipCount(totalDuration: number, segmentDurationSeconds: number): number {
  if (!totalDuration || totalDuration <= 0) return 0;
  if (!segmentDurationSeconds || segmentDurationSeconds <= 0) return 0;
  return Math.max(1, Math.ceil(totalDuration / segmentDurationSeconds));
}

/**
 * Automatically splits a video duration into consecutive equal parts (e.g. 10s, 15s, 30s, 45s, 60s)
 * The final clip preserves remaining footage without exceeding total duration.
 */
export function generateEqualSegments(
  totalDuration: number,
  segmentDurationSeconds: number,
  options?: {
    titlePrefix?: string;
    maxSegments?: number;
    colorPalette?: string[];
  }
): ClipSegment[] {
  if (!totalDuration || totalDuration <= 0) return [];
  if (!segmentDurationSeconds || segmentDurationSeconds <= 0) return [];

  const prefix = options?.titlePrefix || 'Clip';
  const max = options?.maxSegments || 200;
  const defaultColors = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#8B5CF6', // Purple
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#6366F1', // Indigo
  ];
  const colors = options?.colorPalette || defaultColors;

  const segments: ClipSegment[] = [];
  let currentStart = 0;
  let partIndex = 1;

  while (currentStart < totalDuration && segments.length < max) {
    const currentEnd = Math.min(totalDuration, currentStart + segmentDurationSeconds);
    const duration = Math.round((currentEnd - currentStart) * 10) / 10;

    // Pad clip number: "Clip 01", "Clip 02", etc.
    const clipNumStr = partIndex.toString().padStart(2, '0');
    const id = `clip_${partIndex}_${Math.round(currentStart)}`;
    const startFmt = formatTimestamp(currentStart);
    const endFmt = formatTimestamp(currentEnd);

    segments.push({
      id,
      title: `${prefix} ${clipNumStr} (${startFmt} – ${endFmt})`,
      startTime: Math.round(currentStart * 10) / 10,
      endTime: Math.round(currentEnd * 10) / 10,
      duration,
      color: colors[(partIndex - 1) % colors.length],
    });

    currentStart = currentEnd;
    partIndex++;
  }

  return segments;
}

/**
 * Validates a clip segment
 */
export function validateClip(
  start: number,
  end: number,
  totalDuration: number
): { valid: boolean; error?: string } {
  if (start < 0) return { valid: false, error: 'Start time cannot be negative' };
  if (end > totalDuration + 0.1) return { valid: false, error: 'End time cannot exceed video duration' };
  if (end <= start) return { valid: false, error: 'End time must be greater than start time' };
  if (end - start < 0.5) return { valid: false, error: 'Clip must be at least 0.5 seconds long' };

  return { valid: true };
}

/**
 * Generates yt-dlp shell command for high quality direct download of a section
 */
export function generateYtDlpCommand(
  urlOrId: string,
  startSeconds: number,
  endSeconds: number,
  outputFileName: string,
  quality: string = '4k'
): string {
  const startFmt = formatTimestamp(startSeconds);
  const endFmt = formatTimestamp(endSeconds);
  const safeName = outputFileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const target = urlOrId.startsWith('http') ? urlOrId : `https://www.youtube.com/watch?v=${urlOrId}`;

  // If 4k is requested, select highest video stream up to 2160p + best audio
  let formatFilter = 'bestvideo[height<=2160]+bestaudio/best';
  if (quality === '1080p') {
    formatFilter = 'bestvideo[height<=1080]+bestaudio/best';
  } else if (quality === 'source' || quality === '4k') {
    formatFilter = 'bestvideo+bestaudio/best';
  }

  return `yt-dlp -f "${formatFilter}" --download-sections "*${startFmt}-${endFmt}" --force-keyframes-at-cuts "${target}" -o "${safeName}.mp4"`;
}

/**
 * Generates FFmpeg command for slicing video
 */
export function generateFfmpegCommand(
  inputFile: string,
  startSeconds: number,
  endSeconds: number,
  outputFileName: string
): string {
  const startFmt = formatTimestamp(startSeconds);
  const endFmt = formatTimestamp(endSeconds);
  const safeName = outputFileName.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `ffmpeg -ss ${startFmt} -to ${endFmt} -i "${inputFile}" -c copy "${safeName}.mp4"`;
}

/**
 * Estimate file size based on bitrate and duration
 */
export function estimateFileSizeMb(durationSeconds: number, bitrateKbps = 2500): string {
  const totalBits = durationSeconds * (bitrateKbps * 1000);
  const bytes = totalBits / 8;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
