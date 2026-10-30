import { VideoMetadata } from '../types/trimmer';

export const SAMPLE_VIDEOS: VideoMetadata[] = [
  {
    id: 'sample_local_test',
    type: 'sample',
    title: 'ClipCraft 4K Studio Color & Audio Reference (15s Instant Demo)',
    author: 'ClipCraft Engine',
    url: '/demo-sample.mp4',
    duration: 15,
    thumbnailUrl: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=640&q=80',
    aspectRatio: '16:9',
    is4K: true,
  },
  {
    id: 'sample_bunny',
    type: 'sample',
    title: 'Big Buck Bunny (60fps High-Definition Master)',
    author: 'Blender Open Film',
    url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
    duration: 596, // ~9 min 56 sec
    thumbnailUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=640&q=80',
    aspectRatio: '16:9',
  },
  {
    id: 'sample_sintel',
    type: 'sample',
    title: 'Sintel - Cinematic 4K Fantasy Action Sequence',
    author: 'Blender Foundation',
    url: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4',
    duration: 888, // ~14 min 48 sec
    thumbnailUrl: 'https://images.unsplash.com/photo-1534567153574-2b12153a87f0?auto=format&fit=crop&w=640&q=80',
    aspectRatio: '16:9',
  },
  {
    id: 'sample_steel',
    type: 'sample',
    title: 'Tears of Steel - Sci-Fi Action & Cyberpunk Sequence',
    author: 'Blender Open VFX',
    url: 'https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4',
    duration: 734, // ~12 min 14 sec
    thumbnailUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=640&q=80',
    aspectRatio: '16:9',
  },
];

export const POPULAR_YOUTUBE_PRESETS = [
  {
    id: 'yt_mkbhd',
    title: '4K Tech Showcase & Gadget Review (12 min)',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    duration: 596,
    author: 'Tech Studios',
  },
  {
    id: 'yt_veritasium',
    title: 'Scientific Mystery & Physics Exploration (15 min)',
    url: 'https://www.youtube.com/watch?v=bBC-nXj3Ng4',
    duration: 900,
    author: 'Veritasium',
  },
  {
    id: 'yt_lex',
    title: 'Long-Form Podcast & Deep Dive Discussion (20 min)',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    duration: 1200,
    author: 'Studio Podcast',
  },
];
