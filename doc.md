# Local Multimodal RAG System — Complete Project Breakdown

## Tech Stack Overview

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | Next.js 16 (App Router, Turbopack) | Full-stack React framework with server-side API routes |
| **Language** | TypeScript | Type-safe JavaScript |
| **Styling** | Tailwind CSS v4 | Utility-first CSS framework |
| **Database** | Supabase (PostgreSQL + pgvector) | Vector storage + similarity search via Docker |
| **File Storage** | Supabase Storage | Stores uploaded raw images in an `images` bucket |
| **Text Embeddings** | Ollama → `nomic-embed-text` (274MB) | Converts text into 768-dimensional vectors |
| **Vision AI** | Ollama → `moondream` (1.7GB) | Analyzes images and produces text descriptions |
| **Chat AI** | Ollama → `llama3.2:1b` (1.3GB) | Generates natural language answers from context |
| **PDF Parsing** | `pdf-parse` v1.1.1 | Extracts raw text from PDF files |
| **Image Extraction** | Custom pure-JS JPEG scanner | Extracts embedded JPEG images from PDF binary |

---

## Complete File Tree

```
multimodal-rag/
├── .env.local                          # Environment variables
├── next.config.ts                      # Next.js configuration
├── package.json                        # Dependencies & scripts
├── tsconfig.json                       # TypeScript config
├── postcss.config.mjs                  # PostCSS (Tailwind)
├── eslint.config.mjs                   # Linting rules
│
├── app/                                # Next.js App Router
│   ├── layout.tsx                      # Root HTML layout
│   ├── page.tsx                        # Main dashboard page
│   ├── globals.css                     # Global Tailwind styles
│   └── api/
│       ├── upload/
│       │   └── route.ts                # PDF & Image ingestion API
│       └── chat/
│           └── route.ts                # RAG chat API
│
├── components/
│   ├── UploadFile.tsx                  # File upload UI component
│   └── ChatUI.tsx                      # Chat interface component
│
└── supabase/
    ├── config.toml                     # Local Supabase config
    └── migrations/
        └── 20260402..._init_schema.sql # Database schema + functions
```

---

## File-by-File Explanation

---

### 📁 Config & Environment Files

#### `.env.local`
Holds the local Supabase connection credentials:
- `NEXT_PUBLIC_SUPABASE_URL` — Local Supabase API endpoint (`http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public anonymous key for client-side Supabase calls
- `SUPABASE_SERVICE_ROLE_KEY` — Admin key used by backend API routes to bypass Row-Level Security

#### `next.config.ts`
```typescript
serverExternalPackages: ["canvas", "pdf-img-convert"]
```
Tells Next.js Turbopack to NOT bundle these native packages — lets them run as raw Node.js modules on the server.

#### `package.json`
Defines the 6 core runtime dependencies:
- `next`, `react`, `react-dom` — Frontend framework
- `@supabase/supabase-js` — Supabase client SDK
- `pdf-parse` — PDF text extraction
- `ai`, `@ai-sdk/react` — Vercel AI SDK (installed but chat uses custom streaming)

---

### 📁 Database Layer — `supabase/migrations/...init_schema.sql`

This SQL file runs automatically when you execute `npx supabase db reset`. It sets up:

1. **pgvector extension** — Enables PostgreSQL to store and query vector embeddings
2. **`documents` table** — The core data store:
   - `id` (UUID) — Auto-generated primary key
   - `content` (text) — The actual text chunk or image description
   - `metadata` (JSONB) — Source filename, type (`text` or `image`), image URL, chunk index
   - `embedding` (vector(768)) — The 768-dimensional nomic-embed-text vector
3. **`match_documents()` SQL function** — Performs cosine similarity search:
   - Takes a query embedding + threshold + count
   - Returns the closest matching rows ranked by `1 - cosine_distance`
4. **`images` storage bucket** — Public bucket for storing raw uploaded images
5. **Row-Level Security policies** — Allow public read/write access (local dev mode)

---

### 📁 Frontend — `app/layout.tsx`

The root HTML shell wrapping every page. Sets up:
- Google Fonts (Geist Sans + Geist Mono)
- `suppressHydrationWarning` on `<html>` and `<body>` to prevent browser extension hydration crashes
- Full-height flex layout

---

### 📁 Frontend — `app/page.tsx`

The main dashboard landing page at `localhost:3000`. It renders:
- A gradient header title ("Local Multimodal RAG")
- A "How it works" explanation card
- **Left column**: `<UploadFile />` component
- **Right column**: `<ChatUI />` component

Uses a responsive 12-column CSS grid (`md:grid-cols-12`).

---

### 📁 Frontend — `components/UploadFile.tsx`

A React client component (`"use client"`) that handles file uploads:

**What it does:**
1. Renders a file input accepting `PDF, PNG, JPG, WEBP` files
2. Shows the selected file name and size
3. On click "Ingest", creates a `FormData` object and POSTs it to `/api/upload`
4. Shows success (✅) or error (❌) status messages with color-coded backgrounds

**Key details:**
- Completely client-side — runs in the browser
- Disables the button while processing to prevent double-uploads

---

### 📁 Frontend — `components/ChatUI.tsx`

A React client component that implements the streaming chat interface:

**What it does:**
1. Maintains a `messages[]` array of user and assistant messages in React state
2. On submit, POSTs the message history to `/api/chat`
3. Reads the streamed response using `ReadableStream.getReader()` + `TextDecoder`
4. Appends each text chunk to the assistant's message **in real-time** (word by word)
5. Auto-scrolls to the bottom as new text arrives

**Why NOT `useChat`?**
The Vercel AI SDK's `useChat` hook expects a specific streaming protocol format. Since we stream raw text directly from Ollama, a custom implementation is simpler and more reliable.

---

### 📁 Backend — `app/api/upload/route.ts`

The most complex file. This is the **ingestion engine** that processes uploaded files.

**Flow for IMAGE uploads (PNG/JPG/WEBP):**
```
Image File → Base64 encode → Upload to Supabase Storage
                           → Send to moondream (Ollama) for vision description
                           → Embed description via nomic-embed-text
                           → Store description + embedding in documents table
```

**Flow for PDF uploads:**
```
PDF File → pdf-parse extracts text → Split into 1000-char chunks
                                   → Embed each chunk via nomic-embed-text
                                   → Store chunk + embedding in documents table
         → JPEG marker scanner extracts embedded images
                                   → Upload each to Supabase Storage
                                   → Send to moondream for vision description
                                   → Embed description + store in documents table
```

**Key functions:**
- `getOllamaEmbedding(text)` — Calls Ollama's `/api/embeddings` endpoint with `nomic-embed-text`
- `describeImageWithLlava(base64)` — Calls Ollama's `/api/generate` endpoint with `moondream`
- `extractImagesFromPdfBuffer(buffer)` — Pure-JS scanner that finds JPEG images (FF D8...FF D9 markers) embedded in the raw PDF binary, skipping images smaller than 5KB

---

### 📁 Backend — `app/api/chat/route.ts`

The **RAG retrieval + chat generation** engine. This is where the "magic" happens.

**Full flow when you send a message:**
```
User Question
    ↓
1. Embed question via nomic-embed-text (768-dim vector)
    ↓
2. Call match_documents() in Supabase
   → Cosine similarity search (threshold: 0.1, top 8 matches)
    ↓
3. Build system prompt:
   "You are a helpful AI. Answer using ONLY this context: [matched chunks]"
    ↓
4. Send [system prompt + user messages] to llama3.2:1b via Ollama /api/chat
    ↓
5. Stream Ollama's JSON-lines response:
   → Parse each line's .message.content
   → Pipe text chunks into a ReadableStream
   → Return as plain text HTTP response
    ↓
6. ChatUI.tsx reads the stream and renders word-by-word
```

---

## Data Flow Diagram

```mermaid
graph TD
    A[User uploads PDF/Image] --> B[/api/upload]
    B --> C{File Type?}
    C -->|PDF| D[pdf-parse: Extract Text]
    C -->|Image| E[moondream: Describe Image]
    C -->|PDF| F[JPEG Scanner: Extract Images]
    F --> E
    D --> G[nomic-embed-text: Create Embeddings]
    E --> G
    G --> H[(Supabase pgvector: Store)]
    
    I[User asks question] --> J[/api/chat]
    J --> K[nomic-embed-text: Embed Question]
    K --> L[(Supabase: match_documents)]
    L --> M[Build Context Prompt]
    M --> N[llama3.2:1b: Generate Answer]
    N --> O[Stream Response to Browser]
```
