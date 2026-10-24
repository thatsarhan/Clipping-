import { PlatformConfig } from '../types/trimmer';

export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  shorts: {
    id: 'shorts',
    name: 'YouTube Shorts',
    aspectRatio: '9:16',
    idealDurationSeconds: 30,
    description: 'Vertical 9:16 format (max 60s for Shorts shelf)',
    width: 1080,
    height: 1920,
    badgeColor: '#ef4444',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok Video',
    aspectRatio: '9:16',
    idealDurationSeconds: 30,
    description: 'Vertical 9:16 full-screen feed',
    width: 1080,
    height: 1920,
    badgeColor: '#00f2fe',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram Reels / Feed',
    aspectRatio: '9:16',
    idealDurationSeconds: 60,
    description: 'Vertical Reels (9:16) or Square post (1:1)',
    width: 1080,
    height: 1920,
    badgeColor: '#ec4899',
  },
  twitter: {
    id: 'twitter',
    name: 'Twitter / X',
    aspectRatio: '16:9',
    idealDurationSeconds: 120,
    description: 'Landscape or square video feed',
    width: 1280,
    height: 720,
    badgeColor: '#38bdf8',
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube Standard',
    aspectRatio: '16:9',
    idealDurationSeconds: 120,
    description: 'Standard widescreen 16:9 landscape',
    width: 1920,
    height: 1080,
    badgeColor: '#dc2626',
  },
};

export const QUALITY_CONFIGS = {
  '4k': {
    id: '4k',
    label: '4K Ultra HD (2160p)',
    badge: '4K UHD',
    landscapeResolution: { width: 3840, height: 2160 },
    verticalResolution: { width: 2160, height: 3840 },
    bitrateBps: 25000000, // 25 Mbps
  },
  '2k': {
    id: '2k',
    label: '2K Quad HD (1440p)',
    badge: '2K QHD',
    landscapeResolution: { width: 2560, height: 1440 },
    verticalResolution: { width: 1440, height: 2560 },
    bitrateBps: 12000000,
  },
  '1080p': {
    id: '1080p',
    label: '1080p Full HD',
    badge: '1080p FHD',
    landscapeResolution: { width: 1920, height: 1080 },
    verticalResolution: { width: 1080, height: 1920 },
    bitrateBps: 6000000,
  },
  '720p': {
    id: '720p',
    label: '720p HD',
    badge: '720p HD',
    landscapeResolution: { width: 1280, height: 720 },
    verticalResolution: { width: 720, height: 1280 },
    bitrateBps: 3000000,
  },
  source: {
    id: 'source',
    label: 'Source Max (Original 4K/UHD)',
    badge: 'Original 4K',
    landscapeResolution: { width: 3840, height: 2160 },
    verticalResolution: { width: 2160, height: 3840 },
    bitrateBps: 30000000,
  },
};

