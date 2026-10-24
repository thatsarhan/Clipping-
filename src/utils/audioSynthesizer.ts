/**
 * Audio Synthesizer & WAV Encoder for Censor Bleeps and Audio Trimming
 */

// Generate a classic broadcast censor bleep (1000 Hz sine wave)
export function playCensorBeep(durationMs = 800, volume = 0.25) {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, ctx.currentTime); // 1 kHz standard censor tone

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (err) {
    console.warn('AudioContext playback error:', err);
  }
}

// Convert AudioBuffer to WAV Blob
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // Write WAV Header
  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave and write PCM samples
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = channels[channel][i];
      // Clamp between -1 and 1
      sample = Math.max(-1, Math.min(1, sample));
      // Convert to 16-bit signed integer
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

// Generate a synthetic audio clip track with optional censor bleeps
export async function createSyntheticAudioTrack(
  durationSeconds: number,
  censorRanges: { start: number; end: number }[] = []
): Promise<Blob> {
  const sampleRate = 44100;
  const length = Math.floor(durationSeconds * sampleRate);
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextClass();
  const buffer = ctx.createBuffer(2, Math.max(length, 1), sampleRate);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Fill with low atmospheric room tone
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Ambient subtle presence
    const ambient = (Math.random() * 2 - 1) * 0.005;
    left[i] = ambient;
    right[i] = ambient;
  }

  // Insert 1000Hz bleeps in censor intervals
  for (const range of censorRanges) {
    const startIdx = Math.floor(range.start * sampleRate);
    const endIdx = Math.min(length, Math.floor(range.end * sampleRate));
    for (let i = startIdx; i < endIdx; i++) {
      const t = i / sampleRate;
      const bleep = Math.sin(2 * Math.PI * 1000 * t) * 0.35;
      left[i] = bleep;
      right[i] = bleep;
    }
  }

  return audioBufferToWav(buffer);
}
