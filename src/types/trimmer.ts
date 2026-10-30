export interface ClipSegment {
  id: string;
  title: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  duration: number; // in seconds
  color?: string;
  notes?: string;
  hasCensorBleep?: boolean;
  censorRanges?: { start: number; end: number }[]; // seconds relative to clip start
  videoBlobUrl?: string; // in-memory Blob URL of the actual trimmed video
  serverClipUrl?: string; // direct endpoint to the trimmed MP4
  thumbnailUrl?: string; // direct real frame thumbnail URL
  fileSize?: number; // bytes of the trimmed video
}

export type VideoSourceType = 'youtube' | 'file' | 'sample';

export type PlatformFormat = 'shorts' | 'tiktok' | 'instagram' | 'twitter' | 'youtube';

export interface PlatformConfig {
  id: PlatformFormat;
  name: string;
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  idealDurationSeconds: number;
  description: string;
  width: number;
  height: number;
  badgeColor: string;
}

export type VideoQuality = '4k' | '2k' | '1080p' | '720p' | 'source';

export interface QualityConfig {
  id: VideoQuality;
  label: string;
  badge: string;
  landscapeResolution: { width: number; height: number };
  verticalResolution: { width: number; height: number }; // For Shorts / TikTok
  bitrateBps: number;
}

export interface VideoMetadata {
  id: string;
  type: VideoSourceType;
  title: string;
  author?: string;
  url: string;
  duration: number; // total duration in seconds
  thumbnailUrl?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  resolution?: string; // e.g. "4K 2160p", "1080p"
  is4K?: boolean;
  sessionId?: string;
}

export interface SplitPreset {
  id: string;
  name: string;
  durationSeconds: number;
  description: string;
  iconName?: string;
}

export type OutputOrientation = 'original' | '9:16' | '16:9' | '1:1';

export type JobProcessingStatus =
  | 'idle'
  | 'validating'
  | 'preparing'
  | 'queued'
  | 'processing'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ProcessingJob {
  id: string;
  status: JobProcessingStatus;
  progress: number; // 0 to 100
  phaseDescription: string;
  currentClipIndex: number;
  totalClips: number;
  sourceTitle: string;
  sourceDuration: number;
  sliceSeconds: number;
  orientation: OutputOrientation;
  quality: VideoQuality;
  clips: ClipSegment[];
  error?: string;
  createdAt: number;
}
