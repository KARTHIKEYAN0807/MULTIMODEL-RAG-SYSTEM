"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface FileInfo {
  source: string;
  type: string;
  folder: string | null;
  chunkCount: number;
  imageCount: number;
}

interface FolderGroup {
  name: string;
  files: FileInfo[];
  totalChunks: number;
  totalImages: number;
}

export default function FileManager({ refreshTrigger }: { refreshTrigger?: number }) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingTarget, setDeletingTarget] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/files', {
        headers: { 
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_RAG_API_KEY}` 
        }
      });
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error('Failed to fetch files:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles, refreshTrigger]);

  // Group files: folders vs loose files
  const { folders, looseFiles } = (() => {
    const folderMap = new Map<string, FileInfo[]>();
    const loose: FileInfo[] = [];

    for (const file of files) {
      if (file.folder) {
        const existing = folderMap.get(file.folder) || [];
        existing.push(file);
        folderMap.set(file.folder, existing);
      } else {
        loose.push(file);
      }
    }

    const foldersArr: FolderGroup[] = Array.from(folderMap.entries()).map(([name, files]) => ({
      name,
      files,
      totalChunks: files.reduce((s, f) => s + f.chunkCount, 0),
      totalImages: files.reduce((s, f) => s + f.imageCount, 0),
    }));

    return { folders: foldersArr, looseFiles: loose };
  })();

  const toggleFolder = (name: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDeleteFile = async (source: string) => {
    if (!confirm(`Delete "${source}" and all its chunks?`)) return;
    setDeletingTarget(source);
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_RAG_API_KEY}`
        },
        body: JSON.stringify({ source })
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(prev => prev.filter(f => f.source !== source));
      } else {
        alert(`Delete failed: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setDeletingTarget(null);
    }
  };

  const handleDeleteFolder = async (folderName: string) => {
    const folderFiles = files.filter(f => f.folder === folderName);
    if (!confirm(`Delete folder "${folderName}" and all ${folderFiles.length} files inside? This cannot be undone.`)) return;
    
    setDeletingTarget(`folder:${folderName}`);
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_RAG_API_KEY}`
        },
        body: JSON.stringify({ folder: folderName })
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(prev => prev.filter(f => f.folder !== folderName));
      } else {
        alert(`Delete failed: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setDeletingTarget(null);
    }
  };

  const totalFiles = files.length;
  const totalChunks = files.reduce((s, f) => s + f.chunkCount, 0);

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-blue-500/20 flex items-center justify-center text-blue-400 text-[10px]">🗂️</span>
          Knowledge Base
        </h3>
        <button 
          onClick={fetchFiles} 
          className="text-slate-600 hover:text-indigo-400 transition-colors p-1 rounded-md hover:bg-slate-800/50"
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-2xl mb-2 opacity-30">📭</div>
          <p className="text-slate-600 text-xs">No files indexed yet</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-0.5">
          {/* Folder Groups */}
          {folders.map((folder) => (
            <div key={folder.name} className="rounded-lg overflow-hidden">
              {/* Folder Header */}
              <div
                className="flex items-center justify-between px-3 py-2 bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-all group"
                onClick={() => toggleFolder(folder.name)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm flex-shrink-0">
                    {expandedFolders.has(folder.name) ? '📂' : '📁'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-purple-300 font-medium truncate max-w-[140px]" title={folder.name}>
                      {folder.name}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      {folder.files.length} file{folder.files.length !== 1 ? 's' : ''} · {folder.totalChunks} chunks
                      {folder.totalImages > 0 && ` · ${folder.totalImages} img`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.name); }}
                  disabled={deletingTarget === `folder:${folder.name}`}
                  className="opacity-0 group-hover:opacity-100 text-red-500/70 hover:text-red-400 p-1 rounded transition-all disabled:opacity-50 flex-shrink-0"
                  title="Delete entire folder"
                >
                  {deletingTarget === `folder:${folder.name}` ? (
                    <div className="w-3.5 h-3.5 border-2 border-red-400/50 border-t-red-400 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Expanded File List */}
              {expandedFolders.has(folder.name) && (
                <div className="pl-6 border-l-2 border-purple-500/20 ml-4">
                  {folder.files.map((file) => (
                    <div
                      key={file.source}
                      className="flex items-center justify-between px-2 py-1.5 group transition-all hover:bg-slate-800/30"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] flex-shrink-0 opacity-60">
                          {file.type === 'image' ? '🖼️' : '📄'}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-400 truncate max-w-[130px]" title={file.source}>
                            {file.source}
                          </div>
                          <div className="text-[9px] text-slate-700">
                            {file.chunkCount} chunk{file.chunkCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteFile(file.source)}
                        disabled={deletingTarget === file.source}
                        className="opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-400 p-0.5 rounded transition-all disabled:opacity-50 flex-shrink-0"
                        title="Delete file"
                      >
                        {deletingTarget === file.source ? (
                          <div className="w-3 h-3 border-2 border-red-400/50 border-t-red-400 rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Loose Files (no folder) */}
          {looseFiles.map((file) => (
            <div
              key={file.source}
              className="flex items-center justify-between rounded-lg px-3 py-2 group transition-all hover:bg-slate-800/40"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-sm flex-shrink-0 opacity-80">
                  {file.type === 'image' ? '🖼️' : '📄'}
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-slate-300 truncate max-w-[160px]" title={file.source}>
                    {file.source}
                  </div>
                  <div className="text-[10px] text-slate-600">
                    {file.chunkCount} chunk{file.chunkCount !== 1 ? 's' : ''}
                    {file.imageCount > 0 && ` · ${file.imageCount} img`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDeleteFile(file.source)}
                disabled={deletingTarget === file.source}
                className="opacity-0 group-hover:opacity-100 text-red-500/70 hover:text-red-400 p-1 rounded transition-all disabled:opacity-50 flex-shrink-0"
                title="Delete"
              >
                {deletingTarget === file.source ? (
                  <div className="w-3.5 h-3.5 border-2 border-red-400/50 border-t-red-400 rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {totalFiles > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800/50 text-[10px] text-slate-600 text-center">
          {folders.length > 0 && `${folders.length} folder${folders.length !== 1 ? 's' : ''} · `}
          {totalFiles} file{totalFiles !== 1 ? 's' : ''} · {totalChunks} chunks indexed
        </div>
      )}
    </div>
  );
}
