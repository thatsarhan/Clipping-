import { VideoMetadata } from '../types/trimmer';

export const SAMPLE_VIDEOS: VideoMetadata[] = [
  {
    id: 'sample_podcast',
    type: 'sample',
    title: 'The AI Revolution & Future of Media (Podcast Episode #42)',
    author: 'TechCreators Studio',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    duration: 596, // ~9 min 56 sec
    thumbnailUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=640&q=80',
    aspectRatio: '16:9',
  },
  {
    id: 'sample_nature',
    type: 'sample',
    title: 'Cinematic Nature & Wildlife - 4K High Definition Documentary',
    author: 'Wild Earth Productions',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    duration: 653, // ~10 min 53 sec
    thumbnailUrl: 'https://images.unsplash.com/photo-1534567153574-2b12153a87f0?auto=format&fit=crop&w=640&q=80',
    aspectRatio: '16:9',
  },
  {
    id: 'sample_scifi',
    type: 'sample',
    title: 'Tears of Steel - Sci-Fi Action Sequence & VFX Breakdown',
    author: 'Blender Open Film',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    duration: 734, // ~12 min 14 sec
    thumbnailUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=640&q=80',
    aspectRatio: '16:9',
  },
];

export const POPULAR_YOUTUBE_PRESETS = [
  {
    id: 'yt_mkbhd',
    title: 'MKBHD: The State of Modern Tech (12 min)',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration: 720,
    author: 'Marques Brownlee',
  },
  {
    id: 'yt_veritasium',
    title: 'Veritasium: The Infinite Paradox of Science (18 min)',
    url: 'https://www.youtube.com/watch?v=bBC-nXj3Ng4',
    duration: 1080,
    author: 'Veritasium',
  },
  {
    id: 'yt_lex',
    title: 'Lex Fridman Podcast: Deep Learning & Autonomous Systems',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    duration: 1800,
    author: 'Lex Fridman',
  },
];
