
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Download, 
  ExternalLink, 
  RefreshCcw, 
  Search, 
  Box, 
  Image as ImageIcon,
  Zap,
  Info,
  CheckCircle2,
  Cpu,
  Loader2,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Scaling,
  Key,
  AlertTriangle
} from 'lucide-react';
import { IPFSImage, AppState } from './types';
import { fetchIPFSImages, downloadImage, getFileSize } from './services/ipfsService';
import { analyzeImage } from './services/geminiService';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';

const App: React.FC = () => {
  const [images, setImages] = useState<IPFSImage[]>([]);
  const [status, setStatus] = useState<AppState>(AppState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Preview State
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const loadImages = useCallback(async () => {
    setStatus(AppState.FETCHING);
    setError(null);
    try {
      const fetched = await fetchIPFSImages();
      setImages(fetched);
      setStatus(AppState.READY);
      
      // Post-fetch: trigger file size lookups asynchronously
      fetched.forEach(async (img) => {
        const sizeData = await getFileSize(img.url);
        setImages(prev => prev.map(p => p.id === img.id ? { ...p, fileSize: sizeData.formatted, sizeBytes: sizeData.bytes } : p));
      });
    } catch (err: any) {
      setError(err.message || 'Unknown error occurred while fetching IPFS directory');
      setStatus(AppState.ERROR);
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  const filteredImages = useMemo(() => 
    images.filter(img => 
      img.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      img.aiTags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    ), [images, searchQuery]
  );

  const totalSelectedSize = useMemo(() => {
    let total = 0;
    images.forEach(img => {
      if (selectedIds.has(img.id) && img.sizeBytes) {
        total += img.sizeBytes;
      }
    });
    if (total === 0) return '';
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
    return `${(total / (1024 * 1024)).toFixed(1)} MB`;
  }, [images, selectedIds]);

  const toggleSelect = (id: string) => {
    if (isBulkDownloading) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (isBulkDownloading) return;
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map(img => img.id)));
    }
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0 || isBulkDownloading) return;
    setIsBulkDownloading(true);
    setDownloadProgress({ current: 0, total: selectedIds.size });
    
    try {
      const zip = new JSZip();
      const selectedImages = images.filter(img => selectedIds.has(img.id));
      
      let count = 0;
      for (const img of selectedImages) {
        setProcessingId(img.id);
        setDownloadProgress({ current: count + 1, total: selectedIds.size });
        
        const element = itemRefs.current.get(img.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        const response = await fetch(img.url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Failed to download ${img.filename}`);
        const blob = await response.blob();
        zip.file(img.filename, blob);
        
        await new Promise(resolve => setTimeout(resolve, 300));
        count++;
      }

      setProcessingId(null);
      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ipfs_collection_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#10b981', '#f59e0b']
      });
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Bulk download error:", err);
      alert("Download failed: " + (err instanceof Error ? err.message : "Network error"));
    } finally {
      setIsBulkDownloading(false);
      setProcessingId(null);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };

  const handleAnalyze = async (id: string) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, analyzing: true } : img));
    const target = images.find(img => img.id === id);
    if (target) {
      try {
        const tags = await analyzeImage(target.url);
        setImages(prev => prev.map(img => img.id === id ? { ...img, aiTags: tags, analyzing: false } : img));
      } catch (err: any) {
        setImages(prev => prev.map(img => img.id === id ? { ...img, analyzing: false } : img));
        if (err.message === "AUTH_ERROR") {
          setShowApiKeyModal(true);
        } else {
          console.error("Analysis failed:", err);
        }
      }
    }
  };

  const handleOpenKeySelection = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      // After opening the dialog, we assume the user might have updated the key
      // The platform handles the injection, so we just close our modal
      setShowApiKeyModal(false);
    } else {
      // Fallback if not in AI Studio environment (unlikely here)
      alert("Please set your GEMINI_API_KEY in the environment variables.");
    }
  };

  const openPreview = (id: string) => {
    const idx = filteredImages.findIndex(img => img.id === id);
    if (idx !== -1) {
      setIsPreviewLoading(true);
      setPreviewIndex(idx);
    }
  };

  const closePreview = () => setPreviewIndex(null);

  const navigatePreview = (direction: 'next' | 'prev') => {
    if (previewIndex === null) return;
    let nextIdx = direction === 'next' ? previewIndex + 1 : previewIndex - 1;
    if (nextIdx < 0) nextIdx = filteredImages.length - 1;
    if (nextIdx >= filteredImages.length) nextIdx = 0;
    setIsPreviewLoading(true);
    setPreviewIndex(nextIdx);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>, id: string) => {
    const img = e.currentTarget;
    const dims = `${img.naturalWidth} x ${img.naturalHeight}`;
    setImages(prev => prev.map(p => p.id === id ? { ...p, dimensions: dims } : p));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (previewIndex === null) return;
      if (e.key === 'Escape') closePreview();
      if (e.key === 'ArrowRight') navigatePreview('next');
      if (e.key === 'ArrowLeft') navigatePreview('prev');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewIndex, filteredImages]);

  const currentPreview = previewIndex !== null ? filteredImages[previewIndex] : null;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-blue-500/30">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800 px-6 py-4 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg shadow-blue-500/20">
              <Box className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">IPFS Explorer</h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mt-0.5">Asset Downloader & AI Tagger</p>
            </div>
          </div>

          <div className="flex flex-1 max-w-xl items-center relative">
            <Search className="absolute left-4 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Filter by name or AI tags..."
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-600"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={loadImages}
              disabled={isBulkDownloading}
              className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all disabled:opacity-30"
            >
              <RefreshCcw size={20} className={status === AppState.FETCHING ? 'animate-spin' : ''} />
            </button>
            <div className="h-8 w-[1px] bg-slate-800 mx-1" />
            <button 
              onClick={selectAll}
              disabled={isBulkDownloading}
              className="text-sm font-semibold px-4 py-2.5 text-slate-300 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-30"
            >
              {selectedIds.size === images.length ? 'Deselect All' : `Select All (${images.length})`}
            </button>
            <button 
              onClick={handleBulkDownload}
              disabled={selectedIds.size === 0 || isBulkDownloading}
              className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-bold text-sm transition-all overflow-hidden relative ${
                selectedIds.size > 0 
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/20' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              }`}
            >
              {isBulkDownloading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Download size={18} />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {isBulkDownloading ? 
                  `${downloadProgress.current}/${downloadProgress.total}` : 
                  <>
                    Download Pack
                    {selectedIds.size > 0 && (
                      <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded opacity-90 font-mono">
                        {selectedIds.size} • {totalSelectedSize}
                      </span>
                    )}
                  </>
                }
              </span>
              {isBulkDownloading && (
                <div 
                  className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-300" 
                  style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
                />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
        {status === AppState.FETCHING && (
          <div className="flex flex-col items-center justify-center h-80 text-slate-500">
            <RefreshCcw size={64} className="animate-spin mb-6 text-blue-500 opacity-20" />
            <p className="text-xl font-medium text-slate-300">Synchronizing directory...</p>
          </div>
        )}

        {status === AppState.READY && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredImages.map((img) => {
              const isSelected = selectedIds.has(img.id);
              const isProcessing = processingId === img.id;
              
              return (
                <div 
                  key={img.id}
                  ref={(el) => { if(el) itemRefs.current.set(img.id, el); else itemRefs.current.delete(img.id); }}
                  className={`group relative bg-slate-900 border transition-all duration-500 rounded-3xl overflow-hidden flex flex-col ${
                    isSelected 
                      ? 'border-blue-500/50 shadow-2xl shadow-blue-500/10' 
                      : 'border-slate-800/50 hover:border-slate-700/80 shadow-sm'
                  } ${isProcessing ? 'ring-4 ring-blue-500 ring-offset-4 ring-offset-slate-950 scale-105 z-10 shadow-2xl shadow-blue-500/40' : ''}`}
                >
                  {/* Image Display */}
                  <div 
                    className="aspect-square bg-slate-800/50 relative cursor-pointer overflow-hidden"
                    onClick={() => toggleSelect(img.id)}
                  >
                    <img 
                      src={img.url} 
                      alt={img.filename}
                      loading="lazy"
                      onLoad={(e) => handleImageLoad(e, img.id)}
                      className={`w-full h-full object-cover transition-all duration-700 ${
                        isSelected ? 'scale-110 opacity-50 brightness-50' : 'group-hover:scale-110'
                      }`}
                    />
                    
                    {/* Always Visible Checkbox in Corner */}
                    <div className="absolute top-4 left-4 z-30">
                      <div 
                        className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all duration-300 shadow-lg ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-400 scale-110 shadow-blue-500/40' 
                            : 'bg-slate-900/60 border-slate-400 backdrop-blur-lg hover:border-white'
                        }`}
                      >
                        {isSelected && <CheckCircle2 size={18} className="text-white fill-blue-600/20" />}
                      </div>
                    </div>

                    {/* Processing Highlight */}
                    {isProcessing && (
                      <div className="absolute inset-0 bg-blue-600/30 flex items-center justify-center backdrop-blur-[2px] z-20">
                        <div className="bg-white/20 backdrop-blur-2xl p-4 rounded-3xl shadow-2xl border border-white/20 animate-pulse">
                          <Loader2 className="text-white animate-spin" size={40} />
                        </div>
                      </div>
                    )}

                    {/* Quick Action Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-6 flex flex-col justify-end gap-3 z-10">
                      <div className="flex items-center justify-between">
                        <span className="bg-slate-900/95 text-[10px] font-black px-2.5 py-1.5 rounded-lg text-slate-300 mono border border-slate-800">
                          {img.type}
                        </span>
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); openPreview(img.id); }}
                            className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-xl text-white transition-all hover:scale-110"
                            title="Quick View"
                          >
                            <Maximize2 size={18} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); downloadImage(img.url, img.filename); }}
                            className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-xl text-white transition-all hover:scale-110"
                            title="Download"
                          >
                            <Download size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info Card */}
                  <div className="p-5 flex flex-col flex-1">
                    <h4 className="text-sm font-bold text-slate-200 truncate mb-1 leading-tight">
                      {img.filename}
                    </h4>
                    
                    {/* Size and Dimensions Labels */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold uppercase">
                        <FileText size={12} className="text-slate-600" />
                        {img.fileSize || 'Loading...'}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold uppercase">
                        <Scaling size={12} className="text-slate-600" />
                        {img.dimensions || 'Loading...'}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-auto min-h-[52px]">
                      {img.aiTags ? (
                        img.aiTags.map((tag, idx) => (
                          <span key={idx} className="bg-slate-800/80 text-slate-400 text-[10px] font-bold px-3 py-1 rounded-full border border-slate-700/50">
                            {tag}
                          </span>
                        ))
                      ) : (
                        <button 
                          onClick={() => handleAnalyze(img.id)}
                          disabled={img.analyzing || isBulkDownloading}
                          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-30"
                        >
                          {img.analyzing ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Cpu size={14} />
                          )}
                          AI Analyze
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Full Preview Modal */}
      {currentPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-2xl" onClick={closePreview} />
          <div className="relative w-full h-full max-w-7xl flex flex-col items-center animate-in zoom-in-95 duration-300">
            <div className="w-full flex justify-between items-center text-white p-4 shrink-0">
              <div className="flex flex-col min-w-0">
                <h3 className="text-lg font-bold truncate pr-4">{currentPreview.filename}</h3>
                <div className="flex gap-4 mt-1 items-center">
                  <div className="flex gap-2">
                    {currentPreview.aiTags?.map((tag, i) => (
                      <span key={i} className="text-[10px] font-bold bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 whitespace-nowrap">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-[10px] font-black uppercase tracking-tighter">
                    <span className="flex items-center gap-1"><FileText size={12} /> {currentPreview.fileSize}</span>
                    <span className="flex items-center gap-1"><Scaling size={12} /> {currentPreview.dimensions}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => downloadImage(currentPreview.url, currentPreview.filename)} className="p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><Download size={20} /></button>
                <a href={currentPreview.url} target="_blank" rel="noopener noreferrer" className="p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><ExternalLink size={20} /></a>
                <button onClick={closePreview} className="p-2 md:p-3 bg-red-500/20 hover:bg-red-500 text-white rounded-full transition-colors"><X size={20} /></button>
              </div>
            </div>
            <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden">
              <div className="relative w-full h-full flex items-center justify-center px-4">
                {isPreviewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="text-blue-500 animate-spin" size={48} />
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fetching High-Res</span>
                    </div>
                  </div>
                )}
                <img 
                  src={currentPreview.url} 
                  alt={currentPreview.filename} 
                  onLoad={() => setIsPreviewLoading(false)}
                  className={`max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl transition-all duration-500 ${isPreviewLoading ? 'opacity-0 scale-95 blur-xl' : 'opacity-100 scale-100 blur-0'}`}
                />
                <button onClick={(e) => { e.stopPropagation(); navigatePreview('prev'); }} className="absolute left-4 md:left-8 p-3 md:p-5 bg-black/40 hover:bg-blue-600/80 backdrop-blur-md rounded-full text-white transition-all"><ChevronLeft size={32} /></button>
                <button onClick={(e) => { e.stopPropagation(); navigatePreview('next'); }} className="absolute right-4 md:right-8 p-3 md:p-5 bg-black/40 hover:bg-blue-600/80 backdrop-blur-md rounded-full text-white transition-all"><ChevronRight size={32} /></button>
              </div>
            </div>
            <div className="w-full flex justify-center p-6 shrink-0">
              <button onClick={() => toggleSelect(currentPreview.id)} className={`px-10 py-4 rounded-2xl font-bold transition-all flex items-center gap-3 shadow-xl ${selectedIds.has(currentPreview.id) ? 'bg-blue-600 text-white scale-105 shadow-blue-500/30' : 'bg-white text-slate-950 hover:bg-blue-50 hover:scale-105 active:scale-95'}`}>
                <CheckCircle2 size={24} className={selectedIds.has(currentPreview.id) ? 'fill-white/20' : ''} />
                {selectedIds.has(currentPreview.id) ? 'Selected for Collection' : 'Add to Collection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-6 px-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-widest gap-6">
          <div className="flex items-center gap-8">
            <span className="flex items-center gap-2"><ImageIcon size={14} className="text-slate-600" />{images.length} Assets Found</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-blue-500" />{selectedIds.size} Selected</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-800/50 rounded-full border border-slate-700/50">
              <Zap size={14} className="text-yellow-500 fill-yellow-500" />
              <span>Optimized Metadata Sync</span>
            </div>
          </div>
        </div>
      </footer>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowApiKeyModal(false)} />
          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="p-4 bg-amber-500/10 rounded-2xl mb-6">
                <Key className="text-amber-500" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Gemini API Key Required</h3>
              <p className="text-slate-400 text-sm mb-8">
                To use AI analysis features, you need a valid Gemini API key. The current key is missing or invalid.
              </p>
              
              <div className="w-full space-y-3">
                <button 
                  onClick={handleOpenKeySelection}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  <Key size={18} />
                  Select API Key
                </button>
                
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-700"
                >
                  <ExternalLink size={18} />
                  Get API Key
                </a>
                
                <button 
                  onClick={() => setShowApiKeyModal(false)}
                  className="w-full text-slate-500 hover:text-slate-300 text-xs font-bold uppercase tracking-widest pt-2"
                >
                  Cancel
                </button>
              </div>
              
              <div className="mt-8 p-4 bg-slate-950/50 rounded-xl border border-slate-800 w-full">
                <div className="flex items-start gap-3 text-left">
                  <AlertTriangle className="text-amber-500 shrink-0" size={16} />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Note: You must select an API key from a paid Google Cloud project. 
                    Follow the link above to set up billing if you haven't already.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
