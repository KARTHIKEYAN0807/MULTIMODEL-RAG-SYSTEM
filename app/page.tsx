"use client";

import React, { useState } from 'react';
import UploadFile from '@/components/UploadFile';
import ChatUI from '@/components/ChatUI';
import FileManager from '@/components/FileManager';

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <main className="min-h-screen p-4 md:p-8 relative">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ───────────────────────── */}
        <header className="text-center sm:text-left pt-4 pb-6 animate-fade-in-up">
          <div className="flex items-center gap-3 justify-center sm:justify-start mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg glow-accent">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400">
                Multimodal RAG
              </h1>
            </div>
          </div>
          <p className="text-slate-500 text-sm ml-0 sm:ml-[52px]">
            Multi-Query Fusion · Hybrid Search · Vision AI · Local & Private
          </p>
        </header>

        {/* ── Main Grid ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left Sidebar ─────────────── */}
          <div className="lg:col-span-4 space-y-4" style={{ animationDelay: '0.1s' }}>
            
            {/* How it Works */}
            <div className="glass-panel rounded-xl p-4 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
              <h3 className="font-semibold text-white mb-2 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs">⚡</span>
                How it works
              </h3>
              <ul className="text-xs space-y-1.5 text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-0.5">›</span>
                  Upload PDFs or drag & drop images into the chat
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">›</span>
                  Ollama extracts embeddings, Moondream analyzes images
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">›</span>
                  Multi-Query RRF generates 3 search angles and fuses results
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">›</span>
                  Hybrid Vector + Keyword search for maximum recall
                </li>
              </ul>
            </div>

            <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <UploadFile onUploadComplete={() => setRefreshTrigger(prev => prev + 1)} />
            </div>
            
            <div className="animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
              <FileManager refreshTrigger={refreshTrigger} />
            </div>
          </div>

          {/* ── Chat Panel ───────────────── */}
          <div className="lg:col-span-8 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <ChatUI />
          </div>

        </div>

      </div>
    </main>
  );
}
