import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeId,
  formatTimestamp,
  parseTimestamp,
  generateEqualSegments,
  validateClip,
  generateYtDlpCommand,
  generateFfmpegCommand,
  calculateClipCount,
  estimateFileSizeMb,
} from './trimmerLogic';

test('extractYouTubeId extracts video IDs correctly from diverse URL formats', () => {
  // Standard watch URL
  assert.equal(
    extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  // Short URL
  assert.equal(
    extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=42'),
    'dQw4w9WgXcQ'
  );
  // Embed URL
  assert.equal(
    extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  // Shorts URL
  assert.equal(
    extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  // Direct 11-char ID
  assert.equal(
    extractYouTubeId('dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  // Invalid URL
  assert.equal(
    extractYouTubeId('https://vimeo.com/123456'),
    null
  );
  assert.equal(
    extractYouTubeId(''),
    null
  );
});

test('formatTimestamp formats seconds properly into MM:SS and HH:MM:SS', () => {
  assert.equal(formatTimestamp(0), '00:00');
  assert.equal(formatTimestamp(65), '01:05');
  assert.equal(formatTimestamp(120), '02:00'); // 2 minutes exact
  assert.equal(formatTimestamp(3665), '01:01:05'); // > 1 hour
  assert.equal(formatTimestamp(120.4, true), '02:00.4'); // with ms
});

test('parseTimestamp parses time string back to seconds', () => {
  assert.equal(parseTimestamp('02:00'), 120);
  assert.equal(parseTimestamp('01:05'), 65);
  assert.equal(parseTimestamp('01:01:05'), 3665);
  assert.equal(parseTimestamp('45'), 45);
  assert.equal(parseTimestamp('invalid'), 0);
});

test('generateEqualSegments splits a 600-second (10 min) video into 2-minute (120s) parts', () => {
  const segments = generateEqualSegments(600, 120, { titlePrefix: 'Part' });
  assert.equal(segments.length, 5);

  assert.equal(segments[0].startTime, 0);
  assert.equal(segments[0].endTime, 120);
  assert.equal(segments[0].duration, 120);

  assert.equal(segments[1].startTime, 120);
  assert.equal(segments[1].endTime, 240);

  assert.equal(segments[4].startTime, 480);
  assert.equal(segments[4].endTime, 600);
});

test('generateEqualSegments handles uneven total duration gracefully', () => {
  // 250s total with 120s slices: 0-120 (120s), 120-240 (120s), 240-250 (10s)
  const segments = generateEqualSegments(250, 120);
  assert.equal(segments.length, 3);
  assert.equal(segments[2].startTime, 240);
  assert.equal(segments[2].endTime, 250);
  assert.equal(segments[2].duration, 10);
});

test('validateClip enforces valid boundaries and minimum duration', () => {
  assert.equal(validateClip(0, 120, 600).valid, true);
  assert.equal(validateClip(-5, 120, 600).valid, false); // negative
  assert.equal(validateClip(120, 650, 600).valid, false); // exceeds total
  assert.equal(validateClip(100, 50, 600).valid, false); // end <= start
  assert.equal(validateClip(10, 10.2, 600).valid, false); // too short
});

test('generateYtDlpCommand and generateFfmpegCommand create expected command strings', () => {
  const ytdlp = generateYtDlpCommand('dQw4w9WgXcQ', 120, 240, 'clip_part_2');
  assert.ok(ytdlp.includes('--download-sections "*02:00-04:00"'));
  assert.ok(ytdlp.includes('clip_part_2.mp4'));

  const ffmpeg = generateFfmpegCommand('input.mp4', 0, 120, 'part_1');
  assert.ok(ffmpeg.includes('-ss 00:00 -to 02:00'));
  assert.ok(ffmpeg.includes('part_1.mp4'));
});

test('calculateClipCount matches user specification table and ceiling logic', () => {
  assert.equal(calculateClipCount(600, 30), 20); // 10m / 30s = 20
  assert.equal(calculateClipCount(600, 60), 10); // 10m / 60s = 10
  assert.equal(calculateClipCount(600, 15), 40); // 10m / 15s = 40
  assert.equal(calculateClipCount(600, 45), 14); // ceil(600 / 45) = ceil(13.33) = 14 clips
  assert.equal(calculateClipCount(20, 30), 1);   // video shorter than clip duration
});

test('generateEqualSegments generates exact 13 full clips of 45s + 1 final clip from 09:45 to 10:00', () => {
  const segments = generateEqualSegments(600, 45);
  assert.equal(segments.length, 14); // ceil(600 / 45) = 14

  // Check first 13 clips are 45 seconds each
  for (let i = 0; i < 13; i++) {
    assert.equal(segments[i].duration, 45);
    assert.equal(segments[i].startTime, i * 45);
    assert.equal(segments[i].endTime, (i + 1) * 45);
  }

  // Check 14th clip has exactly the remaining footage from 09:45 to 10:00
  const lastClip = segments[13];
  assert.equal(lastClip.startTime, 585); // 09:45
  assert.equal(lastClip.endTime, 600); // 10:00
  assert.equal(lastClip.duration, 15); // 600 - 585 = 15s remainder
});
