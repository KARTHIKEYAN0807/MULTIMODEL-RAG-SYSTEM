"use client";

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  sources?: string[];
}

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ─── Local Storage Persistence ───
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rag_chat_session');
      if (saved) {
        setMessages(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Failed to load chat history", e);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem('rag_chat_session', JSON.stringify(messages));
      } catch (e) {
        console.warn("Could not save chat history (Quota exceeded?)", e);
      }
    } else {
      localStorage.removeItem('rag_chat_session');
    }
    // Snap to bottom during fast streaming chunks to prevent UI scrolling up
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachedImage((event.target?.result as string).split(',')[1]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleAttachClick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachedImage((event.target?.result as string).split(',')[1]);
        };
        reader.readAsDataURL(file);
      }
    };
    inp.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      image: attachedImage || undefined
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_RAG_API_KEY}`
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
            ...(m.image ? { image: m.image } : {})
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Chat request failed');
      }

      // Parse citations from custom header
      const sourcesHeader = response.headers.get('X-Sources');
      let sources: string[] = [];
      if (sourcesHeader) {
        try { sources = JSON.parse(atob(sourcesHeader)); } catch (e) { /* ignore */ }
      }
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources } : m));

      // Stream response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          );
        }
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId ? { ...m, content: `Error: ${error.message}` } : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    setAttachedImage(null);
  };

  return (
    <div
      className={`glass-panel rounded-xl flex flex-col h-[700px] overflow-hidden transition-all ${
        isDragging ? 'border-indigo-500/60 glow-blue' : ''
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* ── Header ────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/40">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h2 className="text-sm font-semibold text-slate-300">AI Chat</h2>
          {isDragging && (
            <span className="text-xs text-indigo-400 font-medium animate-pulse ml-2">
              Drop image here
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="text-xs text-slate-500 hover:text-indigo-400 transition-colors px-2 py-1 rounded-md hover:bg-slate-800/50"
            >
              + New Chat
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ──────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4 animate-pulse-glow">
              <svg className="w-8 h-8 text-indigo-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm mb-1">Ask anything about your documents</p>
            <p className="text-slate-700 text-xs">Upload files in the sidebar, or drag & drop images here</p>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
              style={{ animationDelay: `${Math.min(idx * 0.05, 0.3)}s` }}
            >
              <div className={`max-w-[85%] rounded-xl px-4 py-3 ${
                m.role === 'user'
                  ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-lg'
                  : 'bg-slate-800/60 text-slate-200 border border-slate-700/40'
              }`}>
                {/* Role label */}
                <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${
                  m.role === 'user' ? 'text-indigo-200/60' : 'text-indigo-400/60'
                }`}>
                  {m.role === 'user' ? 'You' : 'AI'}
                </div>

                {/* Attached image */}
                {m.image && (
                  <img
                    src={`data:image/jpeg;base64,${m.image}`}
                    className="w-48 h-auto max-h-48 object-cover rounded-lg mb-2 border border-white/10"
                    alt="Attachment"
                  />
                )}

                {/* Content — Markdown for assistant, plain for user */}
                {m.role === 'assistant' ? (
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {m.content || '​'}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                )}

                {/* Citations */}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-700/30">
                    <div className="text-[9px] uppercase text-slate-500 font-bold mb-1.5 tracking-widest">
                      Sources
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.sources.map((src, i) => (
                        <span key={i} className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate max-w-[120px]">{src}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading indicator */}
        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start">
            <div className="bg-slate-800/60 border border-slate-700/40 px-4 py-3 rounded-xl flex gap-1.5 items-center">
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ────────────────────── */}
      <div className="border-t border-slate-800/60 bg-slate-900/40 flex flex-col">
        {/* Image preview */}
        {attachedImage && (
          <div className="px-4 pt-3 pb-1">
            <div className="relative inline-block">
              <img
                src={`data:image/jpeg;base64,${attachedImage}`}
                className="h-14 w-auto rounded-lg border border-indigo-500/40 shadow-md"
                alt="Preview"
              />
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] font-bold shadow transition-colors"
              >✕</button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-3 flex gap-2 items-center">
          <button
            type="button"
            onClick={handleAttachClick}
            className="text-slate-600 hover:text-indigo-400 p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Attach image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={attachedImage ? "Ask about this image..." : "Ask anything..."}
            className="flex-1 bg-slate-800/50 text-white rounded-lg px-4 py-2.5 text-sm outline-none border border-slate-700/40 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-600"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
            disabled={isLoading || (!input.trim() && !attachedImage)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
