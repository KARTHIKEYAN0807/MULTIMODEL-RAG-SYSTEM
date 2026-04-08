"use client";

import React, { useState } from 'react';

const SUPPORTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.md', '.csv', '.docx'];

function isSupportedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
}

export default function UploadFile({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<'file' | 'folder'>('file');

  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setFolderFiles([]);
      setFolderName("");
      setStatus(null);
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const allFiles = Array.from(e.target.files);
      const supported = allFiles.filter(isSupportedFile);
      
      // Extract folder name from webkitRelativePath
      const firstPath = allFiles[0]?.webkitRelativePath || '';
      const detectedFolder = firstPath.split('/')[0] || 'Uploaded Folder';

      setFolderFiles(supported);
      setFolderName(detectedFolder);
      setFile(null);
      setStatus(null);

      if (supported.length === 0) {
        setStatus(`❌ No supported files found in folder. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      } else if (supported.length < allFiles.length) {
        setStatus(`📁 ${detectedFolder}: ${supported.length} supported files found (${allFiles.length - supported.length} skipped)`);
      } else {
        setStatus(`📁 ${detectedFolder}: ${supported.length} files ready to upload`);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (mode === 'file' && e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
      setFolderFiles([]);
      setFolderName("");
      setStatus(null);
    }
  };

  const uploadSingleFile = async (fileToUpload: File, folder?: string): Promise<{ ok: boolean; chunks: number; error?: string }> => {
    const formData = new FormData();
    formData.append("file", fileToUpload);
    if (folder) formData.append("folder", folder);

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_RAG_API_KEY}` 
      },
      body: formData,
    });

    const result = await response.json();
    if (response.ok) {
      return { ok: true, chunks: result.chunksCount || 0 };
    } else {
      return { ok: false, chunks: 0, error: result.error };
    }
  };

  const handleUpload = async () => {
    // Single file upload
    if (mode === 'file') {
      if (!file && !url.trim()) {
        setStatus("Please select a file or enter a URL first.");
        return;
      }

      setIsUploading(true);
      setStatus("Processing...");

      if (url.trim()) {
        // URL upload (unchanged)
        const formData = new FormData();
        formData.append("url", url.trim());
        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_RAG_API_KEY}` 
            },
            body: formData,
          });
          const result = await response.json();
          if (response.ok) {
            setStatus(`✅ ${result.summary || `Indexed ${result.chunksCount} chunks.`}`);
            setUrl("");
            onUploadComplete?.();
          } else {
            setStatus(`❌ ${result.error || 'Unknown error'}`);
          }
        } catch (error: any) {
          setStatus(`❌ ${error.message}`);
        }
      } else if (file) {
        try {
          const result = await uploadSingleFile(file);
          if (result.ok) {
            setStatus(`✅ Indexed ${result.chunks} chunks from ${file.name}`);
            setFile(null);
            onUploadComplete?.();
            const input = document.getElementById('file-upload') as HTMLInputElement;
            if (input) input.value = '';
          } else {
            setStatus(`❌ ${result.error || 'Unknown error'}`);
          }
        } catch (error: any) {
          setStatus(`❌ ${error.message}`);
        }
      }

      setIsUploading(false);
      return;
    }

    // Folder upload
    if (folderFiles.length === 0) {
      setStatus("No supported files found in the folder.");
      return;
    }

    setIsUploading(true);
    setProgress({ current: 0, total: folderFiles.length });
    let successCount = 0;
    let failCount = 0;
    let totalChunks = 0;

    for (let i = 0; i < folderFiles.length; i++) {
      const f = folderFiles[i];
      setStatus(`📄 Processing ${i + 1}/${folderFiles.length}: ${f.name}...`);
      setProgress({ current: i + 1, total: folderFiles.length });

      try {
        const result = await uploadSingleFile(f, folderName);
        if (result.ok) {
          successCount++;
          totalChunks += result.chunks;
        } else {
          failCount++;
          console.error(`Failed to upload ${f.name}:`, result.error);
        }
      } catch (e: any) {
        failCount++;
        console.error(`Failed to upload ${f.name}:`, e.message);
      }
    }

    setProgress(null);
    setFolderFiles([]);
    setFolderName("");
    const input = document.getElementById('folder-upload') as HTMLInputElement;
    if (input) input.value = '';

    if (failCount === 0) {
      setStatus(`✅ Folder "${folderName}" — ${successCount} files indexed (${totalChunks} chunks total)`);
    } else {
      setStatus(`⚠️ Folder "${folderName}" — ${successCount} OK, ${failCount} failed (${totalChunks} chunks total)`);
    }

    setIsUploading(false);
    onUploadComplete?.();
  };

  const hasContent = mode === 'file' ? (file || url.trim()) : folderFiles.length > 0;

  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-3">
      <h2 className="font-bold text-white flex items-center gap-2">
        <span className="w-5 h-5 rounded-md bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">📁</span>
        Upload Documents
      </h2>

      {/* Mode Toggle */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-0.5">
        <button
          onClick={() => { setMode('file'); setFolderFiles([]); setFolderName(""); setStatus(null); }}
          className={`flex-1 text-xs py-1.5 rounded-md transition-all font-medium ${
            mode === 'file' 
              ? 'bg-indigo-600/30 text-indigo-300 shadow-sm' 
              : 'text-slate-500 hover:text-slate-400'
          }`}
        >
          📄 Single File
        </button>
        <button
          onClick={() => { setMode('folder'); setFile(null); setUrl(""); setStatus(null); }}
          className={`flex-1 text-xs py-1.5 rounded-md transition-all font-medium ${
            mode === 'folder' 
              ? 'bg-purple-600/30 text-purple-300 shadow-sm' 
              : 'text-slate-500 hover:text-slate-400'
          }`}
        >
          📂 Folder
        </button>
      </div>

      {mode === 'file' ? (
        <>
          {/* Drop Zone — Single File */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-500/10'
                : file
                  ? 'border-green-500/40 bg-green-500/5'
                  : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <input
              id="file-upload"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.md,.csv,.docx"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-green-400 text-sm">📎</span>
                <span className="text-sm text-slate-300 truncate max-w-[200px]">{file.name}</span>
                <span className="text-[10px] text-slate-600">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-500">Drop a file here, or <span className="text-indigo-400">browse</span></p>
                <p className="text-[10px] text-slate-600 mt-1">PDF, PNG, JPG, WEBP, DOCX, TXT</p>
              </div>
            )}
          </div>

          {/* URL Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-slate-500 text-xs">🔗</span>
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setStatus(null);
              }}
              placeholder="Or enter a website URL to ingest..."
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-9 pr-3 pt-2.5 pb-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
        </>
      ) : (
        <>
          {/* Folder Upload Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer ${
              folderFiles.length > 0
                ? 'border-purple-500/40 bg-purple-500/5'
                : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
            }`}
            onClick={() => document.getElementById('folder-upload')?.click()}
          >
            <input
              id="folder-upload"
              type="file"
              // @ts-expect-error - webkitdirectory is not in React types
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderChange}
              className="hidden"
            />
            {folderFiles.length > 0 ? (
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-purple-400 text-sm">📂</span>
                  <span className="text-sm text-slate-300 font-medium">{folderName}</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  {folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''} ready
                  {' · '}
                  {(folderFiles.reduce((s, f) => s + f.size, 0) / 1024).toFixed(0)} KB total
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-500">Click to select a <span className="text-purple-400">folder</span></p>
                <p className="text-[10px] text-slate-600 mt-1">All PDFs, Images, and Text files inside will be indexed</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Progress Bar */}
      {progress && (
        <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={isUploading || !hasContent}
        className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
          isUploading || !hasContent
            ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
            : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg glow-accent'
        }`}
      >
        {isUploading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
            {progress 
              ? `Processing ${progress.current}/${progress.total}...` 
              : 'Processing with AI...'}
          </span>
        ) : mode === 'folder' ? `Ingest Folder (${folderFiles.length} files)` : 'Ingest & Embed'}
      </button>

      {/* Status */}
      {status && (
        <div className={`text-xs p-3 rounded-lg ${
          status.includes('❌') ? 'bg-red-900/30 text-red-300 border border-red-800/30' :
          status.includes('✅') ? 'bg-green-900/30 text-green-300 border border-green-800/30' :
          status.includes('⚠️') ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-800/30' :
          'bg-slate-800/50 text-slate-400 border border-slate-700/30'
        }`}>
          {status}
        </div>
      )}
    </div>
  );
}
