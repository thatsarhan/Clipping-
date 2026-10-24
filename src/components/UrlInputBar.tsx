import React, { useState } from 'react';
import { Youtube, Upload, Link2, PlayCircle, Clock, AlertCircle } from 'lucide-react';
import { extractYouTubeId } from '../utils/trimmerLogic';
import { SAMPLE_VIDEOS, POPULAR_YOUTUBE_PRESETS } from '../data/sampleVideos';

interface UrlInputBarProps {
  onLoadYouTube: (url: string, autoSplitMinutes: number) => void;
  onLoadFile: (file: File, autoSplitMinutes: number) => void;
  onLoadSample: (sampleId: string, autoSplitMinutes: number) => void;
  isLoading: boolean;
}

export const UrlInputBar: React.FC<UrlInputBarProps> = ({
  onLoadYouTube,
  onLoadFile,
  onLoadSample,
  isLoading,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoSplitMinutes, setAutoSplitMinutes] = useState<number>(2);
  const [activeTab, setActiveTab] = useState<'url' | 'sample' | 'upload'>('url');

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!urlInput.trim()) {
      setErrorMsg('Please paste a YouTube video link or ID');
      return;
    }

    const videoId = extractYouTubeId(urlInput);
    if (!videoId) {
      setErrorMsg('Invalid YouTube URL. Please enter a valid youtube.com or youtu.be link.');
      return;
    }

    onLoadYouTube(urlInput.trim(), autoSplitMinutes);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadFile(file, autoSplitMinutes);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text);
        setErrorMsg(null);
      }
    } catch {
      // Ignore
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeTab === 'url'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Youtube className="w-4 h-4" />
            <span>YouTube Link</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sample')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeTab === 'sample'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            <span>Demo Videos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload File</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">Auto-slice part duration:</span>
          <select
            value={autoSplitMinutes}
            onChange={(e) => setAutoSplitMinutes(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-red-500 outline-none cursor-pointer"
            aria-label="Auto-slice part duration"
          >
            <option value={1}>1 Minute (Shorts / Reels)</option>
            <option value={2}>2 Minutes (Standard Parts)</option>
            <option value={3}>3 Minutes (Extended)</option>
            <option value={5}>5 Minutes (Chapters)</option>
            <option value={0}>Manual Only (No Auto-split)</option>
          </select>
        </div>
      </div>

      {activeTab === 'url' && (
        <form onSubmit={handleSubmitUrl} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Link2 className="w-4 h-4 text-red-500" />
              </div>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Paste YouTube link (e.g. https://www.youtube.com/watch?v=... or youtu.be/...)"
                className="w-full pl-10 pr-24 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all"
                aria-label="YouTube video URL"
              />
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="absolute inset-y-1.5 right-2 px-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Paste
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-red-600/25 flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <Youtube className="w-4 h-4" />
              <span>{isLoading ? 'Processing...' : 'Load & Slice Video'}</span>
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 text-rose-400 text-xs mt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
            <span className="text-slate-500">Quick Test Links:</span>
            {POPULAR_YOUTUBE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setUrlInput(p.url);
                  onLoadYouTube(p.url, autoSplitMinutes);
                }}
                className="px-2.5 py-1 rounded-md bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {p.title}
              </button>
            ))}
          </div>
        </form>
      )}

      {activeTab === 'sample' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Select a demo video to test in-browser video cutting, trimming, and instant downloads:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SAMPLE_VIDEOS.map((sample) => (
              <div
                key={sample.id}
                onClick={() => onLoadSample(sample.id, autoSplitMinutes)}
                className="group relative bg-slate-950 border border-slate-800 hover:border-red-500/50 rounded-xl p-3 cursor-pointer transition-all hover:shadow-lg hover:shadow-red-500/10"
              >
                <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900 mb-2.5">
                  <img
                    src={sample.thumbnailUrl}
                    alt={sample.title}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                    <PlayCircle className="w-8 h-8 text-white/90 group-hover:scale-110 transition-transform" />
                  </div>
                  <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                    {Math.floor(sample.duration / 60)}:00
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-slate-200 line-clamp-1 group-hover:text-red-400 transition-colors">
                  {sample.title}
                </h4>
                <p className="text-[11px] text-slate-500 line-clamp-1">{sample.author}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/60 rounded-xl p-6 cursor-pointer group transition-colors">
            <Upload className="w-8 h-8 text-slate-500 group-hover:text-red-400 transition-colors mb-2" />
            <span className="text-sm font-medium text-slate-200 group-hover:text-white">
              Choose a video from your computer
            </span>
            <span className="text-xs text-slate-500 mt-1">Supports MP4, WebM, MOV, MKV</span>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );
};
