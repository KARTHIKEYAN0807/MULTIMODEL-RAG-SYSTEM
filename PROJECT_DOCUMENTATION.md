# 📘 Local Multimodal RAG System — Project Documentation

> **Version:** 1.0  
> **Last Updated:** April 2026  
> **Author:** Project Team  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [System Architecture](#4-system-architecture)
5. [Data Flow — Document Ingestion Pipeline](#5-data-flow--document-ingestion-pipeline)
6. [Data Flow — Query & Retrieval Pipeline](#6-data-flow--query--retrieval-pipeline)
7. [Data Flow — Response Generation Pipeline](#7-data-flow--response-generation-pipeline)
8. [Data Flow — Evaluation Pipeline (RAGAS)](#8-data-flow--evaluation-pipeline-ragas)
9. [Database Schema](#9-database-schema)
10. [AI Models Used](#10-ai-models-used)
11. [Key Algorithms & Methods](#11-key-algorithms--methods)
12. [API Reference](#12-api-reference)
13. [Frontend Architecture](#13-frontend-architecture)
14. [Deployment & DevOps](#14-deployment--devops)
15. [Known Pitfalls & Architectural Decisions](#15-known-pitfalls--architectural-decisions)

---

## 1. Project Overview

The **Local Multimodal RAG System** is a privacy-first, AI-powered document intelligence platform that runs entirely on your local machine. Users can upload PDFs, Word documents, plain text files, and images, then ask natural language questions and receive AI-generated answers grounded in their own documents.

### Core Capabilities

| Capability | Description |
|------------|-------------|
| **Document Ingestion** | Accepts PDFs, DOCX, TXT, MD, CSV, images (PNG/JPG/WEBP), and web URLs |
| **Multimodal Analysis** | Vision AI (Moondream) analyzes uploaded images and embedded PDF images |
| **Intelligent Retrieval** | Multi-Query Fusion + Hybrid Search (vector + keyword) + Reciprocal Rank Fusion |
| **Streaming Chat** | Real-time token-by-token response via NDJSON stream buffering |
| **Source Citations** | Every AI response includes which source files were used |
| **RAGAS Evaluation** | Built-in LLM-as-a-Judge scoring for Faithfulness, Relevancy, Precision, Recall, and Similarity |
| **File Management** | CRUD operations for indexed documents (list, count, delete by file or folder) |
| **Privacy** | All AI inference runs locally via Ollama — no data leaves your machine |

---

## 2. Tech Stack

### 2.1 Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.2 (Turbopack) | Full-stack React framework (server + client) |
| **React** | 19.2 | UI component library |
| **TypeScript** | 5.x | End-to-end type safety |
| **Tailwind CSS** | 4.x | Utility-first styling with custom glassmorphism design system |
| **react-markdown** | 10.1 | Renders AI responses as rich Markdown (tables, lists, headings) |
| **remark-gfm** | 4.0 | GitHub Flavored Markdown support (tables, strikethrough, task lists) |
| **rehype-highlight** | 7.0 | Syntax highlighting for code blocks in AI responses |
| **highlight.js** | 11.11 | Underlying syntax highlighting engine |
| **Inter** (Google Font) | — | Primary typeface |

### 2.2 Backend (API Routes)

| Technology | Purpose |
|------------|---------|
| **Next.js API Routes** | RESTful API endpoints (no separate server) |
| **pdf-parse** | Extract text content from PDF files |
| **mammoth** | Extract text content from DOCX (Word) files |
| **cheerio** | HTML parsing for web URL scraping |

### 2.3 AI / Machine Learning (Local via Ollama)

| Model | Type | Dimensions | Purpose |
|-------|------|-----------|---------|
| **llama3.2** (3B params) | Text LLM | — | Chat generation, query reformulation, multi-query generation, RAGAS judging |
| **mxbai-embed-large** | Embedding | 1024-dim | Vector embedding generation for document chunks and search queries |
| **moondream** | Vision LLM | — | Image captioning, visual Q&A, analyzing uploaded/extracted images |

### 2.4 Database & Storage

| Technology | Purpose |
|------------|---------|
| **Supabase** (Cloud PostgreSQL) | Primary database and storage platform |
| **pgvector** extension | Vector similarity search (cosine distance) with HNSW indexing |
| **PostgreSQL tsvector** + GIN index | Full-text search (BM25-style keyword matching) |
| **Supabase Storage** (S3-compatible) | Image file storage for uploaded and extracted images |

### 2.5 DevOps

| Technology | Purpose |
|------------|---------|
| **Docker** | Containerized production deployment |
| **Node.js 20** (Alpine) | Runtime environment |

---

## 3. Project Structure

```
multimodal-rag/
│
├── app/                                    # Next.js App Router
│   ├── api/                                # ──── SERVER-SIDE API ROUTES ────
│   │   ├── chat/
│   │   │   └── route.ts                    # Main RAG chat endpoint (597 lines)
│   │   │                                   #   - Input validation
│   │   │                                   #   - Image detection → Moondream bypass
│   │   │                                   #   - Multi-query generation
│   │   │                                   #   - Hybrid search (vector + keyword)
│   │   │                                   #   - Reciprocal Rank Fusion (RRF)
│   │   │                                   #   - Keyword pinning (stage detection)
│   │   │                                   #   - Context assembly (6000 char limit)
│   │   │                                   #   - LLM streaming response
│   │   │                                   #   - Rule-based RAGAS auto-audit
│   │   │
│   │   ├── upload/
│   │   │   └── route.ts                    # Document ingestion endpoint (386 lines)
│   │   │                                   #   - PDF text extraction (pdf-parse)
│   │   │                                   #   - DOCX text extraction (mammoth)
│   │   │                                   #   - Plain text / CSV / Markdown
│   │   │                                   #   - Image upload + Moondream captioning
│   │   │                                   #   - PDF embedded JPEG extraction
│   │   │                                   #   - URL web scraping (cheerio)
│   │   │                                   #   - Semantic chunking + overlap
│   │   │                                   #   - Embedding + Supabase insert
│   │   │
│   │   ├── files/
│   │   │   └── route.ts                    # File management (154 lines)
│   │   │                                   #   - GET: list files with chunk counts
│   │   │                                   #   - DELETE: remove by source or folder
│   │   │                                   #   - Storage cleanup for images
│   │   │
│   │   ├── evaluate/
│   │   │   └── route.ts                    # RAGAS evaluation (434 lines)
│   │   │                                   #   - Synthetic test case generation
│   │   │                                   #   - 5-metric LLM-as-Judge scoring
│   │   │                                   #   - Weighted score aggregation
│   │   │
│   │   └── rag/
│   │       └── retrieve/
│   │           └── route.ts                # Headless RAG retrieval API (67 lines)
│   │                                       #   - JSON-only retrieval (no LLM generation)
│   │                                       #   - For external LLM integrations
│   │
│   ├── globals.css                         # Design system (glassmorphism, animations)
│   ├── layout.tsx                          # Root layout (Inter font, SEO meta, mesh gradient)
│   └── page.tsx                            # Main page (sidebar + chat grid layout)
│
├── components/                             # ──── CLIENT-SIDE REACT COMPONENTS ────
│   ├── ChatUI.tsx                          # Chat interface (336 lines)
│   │                                       #   - Message list with Markdown rendering
│   │                                       #   - Drag & drop image attachment
│   │                                       #   - Streaming response display
│   │                                       #   - Citation badges
│   │                                       #   - LocalStorage session persistence
│   │
│   ├── UploadFile.tsx                      # File upload panel (with drag & drop zone)
│   │
│   └── FileManager.tsx                     # Indexed files list with delete (CRUD)
│
├── lib/                                    # ──── SHARED LIBRARIES ────
│   ├── rag-engine.ts                       # Reusable RAG retrieval engine (182 lines)
│   │                                       #   - getOllamaEmbedding()
│   │                                       #   - generateMultiQueries()
│   │                                       #   - reciprocalRankFusion()
│   │                                       #   - performFullRetrieval()
│   │
│   └── rag-client-example.ts              # Example usage of RAG engine
│
├── supabase/                               # ──── DATABASE ────
│   └── migrations/
│       └── 20260408_full_schema.sql        # Consolidated schema:
│                                           #   - documents table (pgvector 1024-dim)
│                                           #   - HNSW vector index
│                                           #   - GIN full-text index
│                                           #   - FTS trigger (auto tsvector)
│                                           #   - hybrid_search() RPC function
│
├── public/                                 # Static assets
├── Dockerfile                              # Multi-stage Docker build
├── .env.local                              # Environment variables (Supabase keys, Ollama URL)
├── package.json                            # Dependencies & scripts
├── tsconfig.json                           # TypeScript configuration
├── next.config.ts                          # Next.js configuration
└── .gitignore                              # Git ignore rules
```

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       BROWSER (Next.js Client)                          │
│                                                                         │
│  ┌───────────┐   ┌────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  ChatUI    │   │ UploadFile │   │ FileManager  │   │  Markdown    │ │
│  │ (stream +  │   │ (drag &    │   │ (CRUD list   │   │  Renderer    │ │
│  │  d&d image │   │  drop +    │   │  + delete)   │   │ (react-md +  │ │
│  │  attach)   │   │  folder)   │   │              │   │  highlight)  │ │
│  └─────┬──────┘   └─────┬──────┘   └──────┬───────┘   └──────────────┘ │
│        │                │                  │                             │
└────────┼────────────────┼──────────────────┼─────────────────────────────┘
         │                │                  │
         ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS API ROUTES (Server)                         │
│                                                                         │
│  POST /api/chat ──────────────────────────────────────────────────────  │
│  │  1. Input Validation                                               │ │
│  │  2. Image Detection → [moondream vision bypass]                    │ │
│  │  3. Multi-Query Generation (3 search perspectives)                 │ │
│  │  4. Hybrid Search (vector 65% + keyword 35%) × 3 queries           │ │
│  │  5. Reciprocal Rank Fusion (merge & re-rank)                       │ │
│  │  6. Keyword Pinning (stage-specific content)                       │ │
│  │  7. Context Assembly (6000 char cap) + Citation Extraction         │ │
│  │  8. LLM Streaming Response (NDJSON buffered)                       │ │
│  │  9. Background Rule-Based RAGAS Audit                              │ │
│  │                                                                    │ │
│  POST /api/upload ───────────────────────────────────────────────────  │
│  │  Route 0: URL → fetch + cheerio → chunk → embed → store           │ │
│  │  Route 1: Image → Supabase Storage + Moondream → embed → store    │ │
│  │  Route 2: PDF → text + JPEG extraction → chunk/caption → embed    │ │
│  │  Route 3: DOCX → mammoth text → chunk → embed → store             │ │
│  │  Route 4: TXT/MD/CSV → chunk → embed → store                      │ │
│  │                                                                    │ │
│  GET/DELETE /api/files ──────────────────────────────────────────────  │
│  │  List unique sources → group by filename → return chunk counts     │ │
│  │  Delete by source OR folder → cleanup storage images               │ │
│  │                                                                    │ │
│  POST /api/evaluate ─────────────────────────────────────────────────  │
│  │  Synthetic test generation → Full RAG pipeline → LLM-as-Judge      │ │
│  │                                                                    │ │
│  POST /api/rag/retrieve ─────────────────────────────────────────────  │
│  │  Headless retrieval (JSON only, no LLM generation)                 │ │
│                                                                         │
└────────┬────────────────┬────────────────────────────────────────────────┘
         │                │
         ▼                ▼
┌────────────────┐   ┌─────────────────────────────────────────────┐
│    OLLAMA      │   │            SUPABASE (Cloud)                 │
│  (Local AI)    │   │                                             │
│                │   │  ┌───────────────────────────────────────┐  │
│  llama3.2      │   │  │         documents table               │  │
│  (3B, Chat +   │   │  │  id         uuid (PK)                 │  │
│   Judge)       │   │  │  content    text                      │  │
│                │   │  │  embedding  vector(1024) — HNSW index │  │
│  mxbai-embed   │   │  │  metadata   jsonb                     │  │
│  -large        │   │  │  fts        tsvector — GIN index      │  │
│  (1024-dim     │   │  │  created_at timestamptz               │  │
│   Embeddings)  │   │  │                                       │  │
│                │   │  │  hybrid_search() — RPC function        │  │
│  moondream     │   │  └───────────────────────────────────────┘  │
│  (Vision AI)   │   │                                             │
│                │   │  ┌───────────────────────────────────────┐  │
└────────────────┘   │  │     images storage bucket             │  │
                     │  │   (uploaded + extracted images)        │  │
                     │  └───────────────────────────────────────┘  │
                     └─────────────────────────────────────────────┘
```

---

## 5. Data Flow — Document Ingestion Pipeline

**Endpoint:** `POST /api/upload`  
**File:** `app/api/upload/route.ts`

### 5.1 Flow Diagram

```
User uploads file/URL
       │
       ▼
┌──────────────────┐
│  Input Detection │
│  (MIME type +    │
│   extension)     │
└──────┬───────────┘
       │
       ├─── URL → fetch HTML → cheerio clean → extract text
       ├─── Image (PNG/JPG/WEBP) → Supabase Storage + Moondream caption
       ├─── PDF → pdf-parse text + JPEG binary extraction
       ├─── DOCX → mammoth text extraction
       └─── TXT/MD/CSV → raw UTF-8 read
              │
              ▼
┌──────────────────────────────────────────────────────┐
│          SEMANTIC CHUNKING (for all text)             │
│                                                       │
│  1. Split by paragraphs (\n\n)                       │
│  2. If paragraph > 500 chars → split by sentences    │
│  3. Accumulate until chunk reaches ~500 char limit   │
│  4. Apply 100-char sliding window overlap            │
│     (prepend tail of previous chunk)                 │
│                                                       │
│  Config: CHUNK_SIZE = 500, CHUNK_OVERLAP = 100       │
└──────────┬───────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│          ENRICHMENT + EMBEDDING                       │
│                                                       │
│  1. Prepend source metadata tag:                     │
│     "[Source: filename.pdf | Folder: uploads]"       │
│                                                       │
│  2. Generate 1024-dim vector embedding               │
│     via mxbai-embed-large (Ollama)                   │
│                                                       │
│  3. Insert into Supabase `documents` table:          │
│     { content, embedding, metadata:{source,type} }   │
│                                                       │
│  4. PostgreSQL trigger auto-generates tsvector (fts) │
└──────────────────────────────────────────────────────┘
```

### 5.2 PDF Image Extraction Method

For PDFs containing embedded JPEG images, the system uses a **binary marker scan** approach:

1. Scan the raw PDF `Buffer` byte-by-byte
2. Detect JPEG start marker: `0xFF 0xD8`
3. Scan forward until JPEG end marker: `0xFF 0xD9`
4. Extract the sub-buffer between markers
5. Filter out images smaller than 5KB (noise/icons)
6. Send each image to **Moondream** for vision captioning
7. Embed the caption and store alongside text chunks

> **Why binary scan?** This avoids heavy PDF rendering libraries and works with zero native dependencies — pure JavaScript.

### 5.3 Image Processing Flow

```
Image file received
       │
       ├── Upload original to Supabase Storage bucket ("images")
       │     → generates public URL
       │
       ├── Convert to base64
       │
       ├── Send to Moondream via Ollama /api/generate
       │     Prompt: "Analyze this image in detail. Describe everything
       │              you see including text, diagrams, charts..."
       │
       ├── Receive text description from Moondream
       │
       ├── Enrich: "[Image File: photo.png]\n\n{description}"
       │
       ├── Generate embedding (mxbai-embed-large, 1024-dim)
       │
       └── Insert into documents table
             metadata: { source, type:"image", imageUrl }
```

### 5.4 URL Scraping Flow

```
URL string received
       │
       ├── fetch(url) → get raw HTML
       │
       ├── cheerio.load(html)
       │     → Remove: script, style, noscript, nav, footer,
       │               header, aside, .ad, .advertisement
       │
       ├── Extract clean body text
       │
       ├── Collapse excessive whitespace
       │
       └── Feed into standard text chunking pipeline
```

---

## 6. Data Flow — Query & Retrieval Pipeline

**Endpoint:** `POST /api/chat`  
**File:** `app/api/chat/route.ts`

### 6.1 Complete Query Processing Flow

```
User sends message
       │
       ▼
┌──── STEP 1: INPUT VALIDATION ────┐
│  Validate messages array exists   │
│  Extract latest message content   │
└──────────┬───────────────────────┘
           │
           ▼
┌──── STEP 2: IMAGE ROUTING ───────┐
│  If message has `.image` field:   │
│    → Route DIRECTLY to Moondream  │
│    → Skip entire RAG pipeline     │
│    → Stream vision response       │
│    → Return (no retrieval)        │
└──────────┬───────────────────────┘
           │ (text-only path)
           ▼
┌──── STEP 3: MULTI-QUERY GENERATION ──────────────────────┐
│                                                           │
│  METHOD: Generate 3 different search perspectives         │
│                                                           │
│  Bypass Conditions (use original query only):             │
│    • Query ≤ 2 words (too short)                         │
│    • Query matches structured patterns:                   │
│      "stage N", "scoring logic", "marks",                │
│      "assessment criteria", "eligibility", etc.          │
│                                                           │
│  Generation:                                              │
│    • Send to llama3.2 with system prompt:                │
│      "Generate exactly 3 different search queries..."    │
│    • 8-second AbortController timeout                    │
│    • Fallback: use original query on timeout/failure     │
│                                                           │
│  Result: [original_query, alt_1, alt_2, alt_3]           │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──── STEP 4: HYBRID SEARCH (per query) ───────────────────┐
│                                                           │
│  For EACH of the 3-4 queries, in parallel:               │
│                                                           │
│  a) Generate embedding via mxbai-embed-large             │
│                                                           │
│  b) Call Supabase RPC hybrid_search():                   │
│     ┌─ VECTOR SEARCH (weight: 0.65) ───────────────┐    │
│     │  • Cosine similarity: 1 - (embedding <=> q)   │    │
│     │  • HNSW index for fast ANN search             │    │
│     │  • Threshold: 0.005                           │    │
│     └───────────────────────────────────────────────┘    │
│     ┌─ KEYWORD SEARCH (weight: 0.35) ──────────────┐    │
│     │  • PostgreSQL ts_rank_cd() scoring            │    │
│     │  • websearch_to_tsquery() for phrase matching  │    │
│     │  • GIN index on tsvector column               │    │
│     └───────────────────────────────────────────────┘    │
│     Results: UNION ALL of both, limit 15 per query       │
│                                                           │
│  c) Fallback: If hybrid_search fails → match_documents   │
│     (vector-only cosine search)                          │
│                                                           │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──── STEP 5: RECIPROCAL RANK FUSION (RRF) ───────────────┐
│                                                           │
│  METHOD: Merge all result sets into a single ranking     │
│                                                           │
│  Algorithm:                                               │
│    For each document across all result sets:             │
│      score = Σ  1 / (k + rank + 1)                      │
│    where k = 60 (smoothing constant)                     │
│                                                           │
│  Steps:                                                   │
│    1. Iterate all result sets (3-4 queries × 15 docs)    │
│    2. For each doc, accumulate RRF score by rank         │
│    3. Deduplicate by document ID                         │
│    4. Sort descending by accumulated score               │
│    5. Select top 10 documents                            │
│                                                           │
│  Why RRF? Same algorithm used by Elasticsearch.          │
│  Produces robust ranking even with different score       │
│  distributions across search methods.                    │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──── STEP 6: KEYWORD PINNING (Optional) ─────────────────┐
│                                                           │
│  METHOD: Two-pass deterministic override for structured  │
│  queries (e.g., "Stage 3 scoring criteria")              │
│                                                           │
│  Triggered when: query contains "stage N" pattern        │
│                                                           │
│  Pass 1: Direct ILIKE search for stage label             │
│    SELECT * FROM documents                               │
│    WHERE content ILIKE '%stage 3%' LIMIT 6               │
│                                                           │
│  Pass 2: Search for adjacent scoring table keywords      │
│    Keywords: tools, checkboxes, sliders, marks,          │
│    subjects studied, scoring criteria, etc.              │
│                                                           │
│  Result: Pinned chunks placed at TOP of context window   │
│  (guarantees high-precision retrieval for structured     │
│  document sections that vector search may miss)          │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──── STEP 7: IMAGE RETRIEVAL (Optional) ─────────────────┐
│                                                           │
│  If no image found in hybrid search results:             │
│                                                           │
│  a) Try metadata/content ILIKE match on query words      │
│     WHERE metadata->>'type' = 'image'                    │
│     AND (source ILIKE '%word%' OR content ILIKE '%word%')│
│                                                           │
│  b) Fallback: If user asked for "latest image"           │
│     → Fetch most recent image by created_at DESC         │
│                                                           │
│  Pinned image context is prepended to context string     │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──── STEP 8: CONTEXT ASSEMBLY ───────────────────────────┐
│                                                           │
│  Assembly order (highest precision first):               │
│    1. Pinned keyword chunks (if any)                     │
│    2. Pinned image context (if any)                      │
│    3. Top-K vector/RRF results (deduped against pinned)  │
│                                                           │
│  Hard cap: 6000 characters                               │
│    → Truncated with: "...[context truncated]"            │
│                                                           │
│  Citation extraction:                                     │
│    → Collect all unique metadata.source values           │
│    → Encode as Base64 JSON in X-Sources HTTP header      │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Search Weight Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| `vector_weight` | 0.65 | Weight for cosine similarity scores |
| `text_weight` | 0.35 | Weight for BM25 full-text scores |
| `match_count` | 15 | Max docs per search query |
| `match_threshold` | 0.005 | Min similarity to include a result |
| `RRF k` | 60 | Smoothing constant for Reciprocal Rank Fusion |
| `top_k` | 10 | Final number of documents sent to LLM |
| `CONTEXT_CHAR_LIMIT` | 6000 | Maximum characters in assembled context |

---

## 7. Data Flow — Response Generation Pipeline

### 7.1 System Prompt Construction

The system prompt is dynamically constructed based on whether context was found:

**With context:**
```
You are a precise AI assistant that answers questions using ONLY the provided document context.

RULES:
1. Answer using ONLY information from the context below. Do NOT use outside knowledge.
2. If the context contains scoring criteria, marks, or rubrics — quote them exactly.
3. Structure your answer clearly: use bullet points or a table if the source uses them.
4. Be concise and directly answer the user's question.
5. In your answer, naturally use the key terms from the user's question.
6. Ground every fact you state in the context — use exact words/numbers from the document.

Context:
{assembled context text}
```

**Without context:**
```
You are a precise AI assistant.
No relevant document chunks were found matching this query.
Respond with: "I do not have enough information based on the provided documents."
Suggest the user upload or re-index the relevant document.
```

### 7.2 Streaming Architecture

```
Ollama /api/chat (stream: true)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  NDJSON STREAM PROCESSING (ReadableStream API)           │
│                                                           │
│  1. Reader reads raw bytes from Ollama TCP connection    │
│  2. Decoder converts bytes → UTF-8 text                  │
│  3. Buffer accumulates partial JSON across TCP chunks    │
│  4. Split buffer by newlines                             │
│  5. Parse each complete line as JSON                     │
│  6. Extract message.content token                        │
│  7. Enqueue token to browser ReadableStream              │
│  8. Accumulate full response for post-audit              │
│                                                           │
│  On stream end:                                          │
│    → Flush remaining buffer                              │
│    → Trigger background RAGAS audit                      │
│    → Close controller                                    │
└──────────────────────────────────────────────────────────┘
       │
       ▼
Browser receives text/plain stream
       │
       ▼
ChatUI reads chunks via ReadableStream reader
       │
       ▼
React state updates → Markdown rendering → UI
```

### 7.3 LLM Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `model` | llama3.2 | Primary text generation model |
| `num_ctx` | 4096 | Context window size (VRAM safety cap) |
| `temperature` | 0.0 | Deterministic output (no randomness) |
| `stream` | true | Token-by-token streaming |

### 7.4 Citation Delivery

Citations are passed to the browser via a custom HTTP header:

```
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
X-Sources: eyJmaWxlcy...(base64)

[streaming text body]
```

The client decodes: `JSON.parse(atob(response.headers.get('X-Sources')))`  
Result: `["document.pdf", "image.png"]`

---

## 8. Data Flow — Evaluation Pipeline (RAGAS)

**Endpoint:** `POST /api/evaluate`  
**File:** `app/api/evaluate/route.ts`

### 8.1 RAGAS Evaluation Flow

```
POST /api/evaluate
       │
       ├── Option A: User provides { questions: [...] }
       │
       └── Option B: Auto-generate synthetic test cases
           │
           ├── Fetch random chunks from documents table
           ├── Ask llama3.1 to generate Q&A pairs per chunk
           └── Parse QUESTION: / ANSWER: format
               │
               ▼
┌──── FOR EACH TEST QUESTION ──────────────────────────────┐
│                                                           │
│  Step 1: Query full RAG pipeline (/api/chat)             │
│    → Capture: answer text, X-Sources header, latency     │
│                                                           │
│  Step 2: Run 5 LLM-as-Judge evaluations (parallel)      │
│                                                           │
│  ┌─ Faithfulness (25%) ─────────────────────────────┐    │
│  │  "Is the answer grounded? No hallucinations?"     │    │
│  │  Score: 1-5 via llama3.1                         │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌─ Answer Relevancy (25%) ─────────────────────────┐    │
│  │  "Does the answer directly address the question?" │    │
│  │  Score: 1-5 via llama3.1                         │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌─ Context Precision (15%) ────────────────────────┐    │
│  │  "Were the retrieved source files relevant?"      │    │
│  │  Score: 1-5 via llama3.1                         │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌─ Context Recall (15%) ───────────────────────────┐    │
│  │  "Does context contain info for ground truth?"    │    │
│  │  Score: 1-5 via llama3.1                         │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌─ Answer Similarity (20%) ────────────────────────┐    │
│  │  "How close is AI answer to the golden answer?"   │    │
│  │  Score: 1-5 via llama3.1                         │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  Step 3: Weighted aggregation                            │
│    overall = F×0.25 + R×0.25 + CP×0.15 + CR×0.15       │
│             + AS×0.20                                    │
│                                                           │
└──────────────────────────────────────────────────────────┘
       │
       ▼
Return JSON: { totalQuestions, averageScores, results[], evaluatedAt }
```

### 8.2 Real-Time Auto-Audit (Rule-Based)

In addition to the full RAGAS evaluation endpoint, every chat response triggers a **zero-latency rule-based audit** in the background:

| Metric | Method | Algorithm |
|--------|--------|-----------|
| **Faithfulness** | Unigram content-word grounding | Tokenize answer → filter stop words → check what fraction of content words appear in the retrieved context. Score: >55% → 5/5, >40% → 4/5, etc. |
| **Relevancy** | Question-type-aware satisfaction | 1) Detect question type (factual, explanatory, procedural, listing, yes/no). 2) Check if answer structure matches intent. 3) Compute key-term overlap with synonym normalization. 4) Combine both signals. |

```
Terminal Output:
┌───────────────── AI SELF-AUDIT REPORT ─────────────────┐
│ Question: How does the funding evaluation work?...      │
│ Latency:  6.42s                                         │
├─────────────────────────────────────────────────────────┤
│ FAITHFULNESS (Grounding): [★★★★★] 5/5                  │
│ ANSWER RELEVANCY:         [★★★★★] 5/5                  │
├─────────────────────────────────────────────────────────┤
│ STATUS:  [✅ PASS] Audit Complete                       │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Database Schema

**Migration File:** `supabase/migrations/20260408_full_schema.sql`

### 9.1 Documents Table

```sql
CREATE TABLE public.documents (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content    text NOT NULL,                    -- The actual text chunk or image caption
  embedding  vector(1024) NOT NULL,            -- 1024-dim vector from mxbai-embed-large
  metadata   jsonb DEFAULT '{}'::jsonb NOT NULL, -- Source info, type, folder, etc.
  created_at timestamptz DEFAULT now() NOT NULL,
  fts        tsvector                          -- Auto-populated by trigger
);
```

### 9.2 Metadata JSONB Structure

```json
// For text chunks:
{
  "source": "document.pdf",
  "type": "text",
  "chunkIndex": 3,
  "folder": "uploads"          // optional
}

// For images:
{
  "source": "photo.png",
  "type": "image",
  "imageUrl": "https://supabase.co/storage/v1/object/public/images/...",
  "pageIndex": 0,              // for PDF-extracted images
  "folder": "uploads"          // optional
}
```

### 9.3 Indexes

| Index | Type | Column | Parameters |
|-------|------|--------|------------|
| `documents_embedding_idx` | HNSW | `embedding` | `vector_cosine_ops`, m=16, ef_construction=64 |
| `documents_fts_idx` | GIN | `fts` | Standard GIN for tsvector |

### 9.4 Triggers

```sql
-- Auto-populate fts column on every INSERT/UPDATE
CREATE TRIGGER documents_fts_update
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION documents_fts_trigger();

-- Trigger function:
NEW.fts := to_tsvector('english', NEW.content);
```

### 9.5 RPC Functions

**`hybrid_search()`** — Core retrieval function called by the API:

```sql
hybrid_search(
  query_text text,              -- User's search text
  query_embedding vector(1024), -- Pre-computed embedding
  match_count int DEFAULT 10,   -- Max results
  vector_weight float DEFAULT 0.7,
  text_weight float DEFAULT 0.3,
  match_threshold float DEFAULT 0.1
)
```

Returns `UNION ALL` of:
- **Vector results:** Cosine similarity × vector_weight, filtered by threshold
- **Keyword results:** `ts_rank_cd()` × text_weight, filtered by `@@` match

---

## 10. AI Models Used

### 10.1 llama3.2 (3B Parameters)

| Use Case | Endpoint | Configuration |
|----------|----------|---------------|
| Chat generation | `POST /api/chat` | `stream: true, num_ctx: 4096, temperature: 0.0` |
| Multi-query generation | `POST /api/chat` | `stream: false, num_ctx: 2048` |
| RAGAS Judge | `POST /api/evaluate` | `stream: false, num_ctx: 4096, temperature: 0.1` |
| Synthetic data gen | `POST /api/evaluate` | `stream: false, num_ctx: 4096, temperature: 0.1` |

### 10.2 mxbai-embed-large (1024 dimensions)

| Use Case | Endpoint | Notes |
|----------|----------|-------|
| Document chunk embedding | `POST /api/upload` | Each chunk enriched with source metadata before embedding |
| Search query embedding | `POST /api/chat` | Each multi-query variant is independently embedded |
| Headless retrieval embedding | `POST /api/rag/retrieve` | Same pipeline as chat |

### 10.3 moondream (Vision)

| Use Case | Endpoint | Notes |
|----------|----------|-------|
| Uploaded image captioning | `POST /api/upload` | Full description prompt |
| PDF embedded image analysis | `POST /api/upload` | Same prompt as uploaded images |
| Direct vision Q&A | `POST /api/chat` | Routes to moondream when image attached to message |

---

## 11. Key Algorithms & Methods

### 11.1 Semantic Chunking with Overlap

```
Method: Paragraph-aware → Sentence-aware → Sliding Window

1. Split text by double newlines (paragraphs)
2. If paragraph exceeds CHUNK_SIZE (500):
   → Split by sentence boundaries ([.!?])
   → Accumulate sentences until limit
3. Otherwise accumulate paragraphs into chunks
4. After all raw chunks created:
   → Prepend last 100 chars of previous chunk (overlap)

Why: Preserves semantic meaning at paragraph boundaries.
The overlap prevents context loss when information spans
two consecutive chunks.
```

### 11.2 Multi-Query Generation

```
Method: LLM-based query expansion with smart bypass

1. Check bypass conditions:
   - Short query (≤ 2 words) → use original only
   - Structured patterns (stage N, scoring, marks) → use original only

2. If no bypass:
   - Ask llama3.2 to generate 3 variant queries
   - Each from a different angle (synonyms, broader, specific)
   - 8-second timeout via AbortController
   - Result: [original, variant1, variant2, variant3]

3. Fallback: On any failure → [original query only]
```

### 11.3 Hybrid Search

```
Method: Parallel vector + keyword search with configurable weights

Vector Search (65% weight):
  - Convert query to 1024-dim embedding
  - Cosine similarity via pgvector HNSW index
  - Score: (1 - cosine_distance) × 0.65

Keyword Search (35% weight):
  - PostgreSQL websearch_to_tsquery()
  - ts_rank_cd() scoring on GIN-indexed tsvector
  - Score: ts_rank × 0.35

Both run within a single SQL RPC call (UNION ALL)
```

### 11.4 Reciprocal Rank Fusion (RRF)

```
Method: Score-agnostic rank fusion across multiple result sets

Algorithm:
  For each document appearing in any result set:
    RRF_score = Σ  1 / (k + rank_i + 1)
  
  where:
    k = 60 (smoothing constant)
    rank_i = position in result set i (0-indexed)
    Sum over all result sets containing this document

Properties:
  - Score-distribution agnostic (only uses rank positions)
  - Documents appearing in multiple searches get boosted
  - Same algorithm used in Elasticsearch and RankFusion
```

### 11.5 NDJSON Stream Buffering

```
Method: Buffer accumulation for TCP chunk boundary handling

Problem: Ollama streams as Newline-Delimited JSON (NDJSON).
TCP may split a JSON object across multiple chunks.

Solution:
  1. Maintain a string buffer across read() calls
  2. Append decoded bytes to buffer
  3. Split buffer by newlines
  4. Keep last element (potentially incomplete) as new buffer
  5. Parse all complete lines as JSON
  6. Extract message.content tokens
  7. Enqueue to browser ReadableStream

Result: Zero dropped tokens during streaming.
```

### 11.6 Keyword Pinning (Two-Pass Retrieval)

```
Method: Deterministic content override for structured documents

Trigger: Query contains "stage N" pattern

Pass 1 — Header chunks:
  SELECT FROM documents WHERE content ILIKE '%stage 3%'
  
Pass 2 — Adjacent scoring table chunks:
  SELECT FROM documents WHERE content ILIKE ANY OF:
    '%tools%', '%checkboxes%', '%sliders%', '%marks%',
    '%scoring criteria%', '%subjects studied%', etc.

Pinned chunks are placed at the absolute top of LLM context,
above all vector/RRF results. This guarantees retrieval of
structured content that may score low on cosine similarity.
```

### 11.7 Rule-Based RAGAS Audit

```
Method: Zero-latency faithfulness + relevancy check (no LLM needed)

Faithfulness:
  - Tokenize answer → remove stop words → keep content words + numbers
  - Check: what fraction of answer's content words appear in context?
  - Thresholds: >55% → 5/5, >40% → 4/5, >25% → 3/5, >10% → 2/5

Relevancy:
  - Detect question type (factual, explanatory, procedural, listing, yes/no)
  - Check structural satisfaction (e.g., factual → contains numbers)
  - Compute key-term overlap with synonym normalization
  - Combine: both satisfied + high term overlap → 5/5
```

---

## 12. API Reference

### 12.1 `POST /api/chat` — RAG Chat

**Purpose:** Send a message and receive a streaming AI response grounded in indexed documents.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `Array<{role, content, image?}>` | ✅ | Chat messages array |
| `messages[].role` | `"user"` or `"assistant"` | ✅ | Message sender |
| `messages[].content` | `string` | ✅ | Message text |
| `messages[].image` | `string (base64)` | ❌ | Attached image (routes to Moondream) |

**Response:**
- **Body:** `text/plain` stream (token-by-token text)
- **Header:** `X-Sources` — Base64-encoded JSON array of source filenames

---

### 12.2 `POST /api/upload` — Document Ingestion

**Purpose:** Upload a file or URL for processing and indexing.

| Field | Type | Description |
|-------|------|-------------|
| `file` | `File (multipart/form-data)` | PDF, DOCX, TXT, MD, CSV, PNG, JPG, WEBP |
| `url` | `string` | URL to scrape (alternative to file) |
| `folder` | `string` | Optional folder tag for batch organization |

**Supported file types:**
| Type | Processing |
|------|-----------|
| PDF | Text extraction + embedded JPEG extraction + Moondream captioning |
| DOCX | Mammoth text extraction |
| TXT / MD / CSV | Raw UTF-8 read |
| Images | Supabase Storage upload + Moondream caption + embedding |
| URLs | Cheerio HTML scraping + text extraction |

**Response:**
```json
{
  "success": true,
  "chunksCount": 12,
  "summary": "Processed 10 text chunks and 2 images."
}
```

---

### 12.3 `GET /api/files` — List Indexed Files

**Purpose:** List all unique uploaded files with their chunk counts.

**Response:**
```json
{
  "files": [
    {
      "source": "document.pdf",
      "type": "text",
      "folder": null,
      "chunkCount": 15,
      "imageCount": 2
    }
  ]
}
```

---

### 12.4 `DELETE /api/files` — Delete Indexed File

**Purpose:** Delete all chunks and images for a specific file or folder.

| Field | Type | Description |
|-------|------|-------------|
| `source` | `string` | Filename to delete |
| `folder` | `string` | Folder name to delete (alternative) |

**Response:**
```json
{
  "success": true,
  "deletedChunks": 15,
  "deletedImages": 2,
  "deletedTarget": "file: document.pdf"
}
```

---

### 12.5 `POST /api/evaluate` — RAGAS Evaluation

**Purpose:** Run comprehensive RAG pipeline evaluation.

| Field | Type | Description |
|-------|------|-------------|
| `questions` | `string[]` or `{question, groundTruth}[]` | Test questions (optional — auto-generates if omitted) |
| `count` | `number` | Number of synthetic test cases (default: 5) |

**Response:**
```json
{
  "totalQuestions": 5,
  "averageScores": {
    "faithfulness": 4.2,
    "answerRelevancy": 4.0,
    "contextPrecision": 3.8,
    "contextRecall": 4.0,
    "answerSimilarity": 3.6,
    "overall": 3.95
  },
  "averageLatencyMs": 8500,
  "results": [ ... ],
  "evaluatedAt": "2026-04-09T..."
}
```

---

### 12.6 `POST /api/rag/retrieve` — Headless Retrieval

**Purpose:** Retrieve context without LLM generation. For external LLM integrations.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | `string` | ✅ | Search query |

**Response:**
```json
{
  "query": "original query",
  "retrieval_stats": {
    "duration_ms": 1200,
    "multi_queries_used": ["query1", "query2", "query3"],
    "docs_found": 10,
    "has_image_context": false
  },
  "context": {
    "text_chunks": [
      { "content": "...", "source": "doc.pdf", "score": 0.032 }
    ],
    "image_analysis": null
  },
  "full_context_text": "..."
}
```

---

### 12.7 API Security

All endpoints support optional API key authentication:

- Set `RAG_API_KEY` in `.env.local`
- Send: `Authorization: Bearer <your-key>` header
- If `RAG_API_KEY` is not set, endpoints are open (no auth required)

---

## 13. Frontend Architecture

### 13.1 Component Hierarchy

```
layout.tsx (Root)
  ├── globals.css (Design system + mesh gradient)
  └── page.tsx (Main page)
        ├── Header (gradient title + subtitle)
        ├── Sidebar (lg:col-span-4)
        │     ├── "How it works" panel
        │     ├── UploadFile.tsx (drag & drop upload)
        │     └── FileManager.tsx (CRUD file list)
        └── Chat Panel (lg:col-span-8)
              └── ChatUI.tsx (streaming chat)
```

### 13.2 Design System

| Element | Style |
|---------|-------|
| **Background** | Dark (#030712) with radial gradient mesh overlay |
| **Panels** | Glassmorphism (`backdrop-filter: blur(16px)`) |
| **Accents** | Indigo (#6366f1) → Purple (#8b5cf6) gradient |
| **Animations** | fadeInUp, shimmer, pulseGlow |
| **Scrollbar** | Custom indigo-tinted thin scrollbar |
| **Typography** | Inter font, anti-aliased |

### 13.3 Chat Session Persistence

- Messages are saved to `localStorage` under key `rag_chat_session`
- Loaded on component mount
- Cleared on "New Chat" action
- Handles quota exceeded errors gracefully

---

## 14. Deployment & DevOps

### 14.1 Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
OLLAMA_URL="http://127.0.0.1:11434"
RAG_API_KEY="optional-api-key"
```

### 14.2 Docker Deployment

The project includes a multi-stage Dockerfile:

```
Stage 1: deps     → npm ci (install dependencies)
Stage 2: builder  → npm run build (Next.js production build)
Stage 3: runner   → Standalone server (minimal image)
```

**Commands:**
```bash
npm run docker:build    # Build image
npm run docker:up       # Run container (port 3000)
npm run docker:down     # Stop and remove container
```

> **Note:** Docker container uses `host.docker.internal` for Ollama access.

### 14.3 Production Deployment Options

| Component | Free Option |
|-----------|-------------|
| Next.js App | Vercel, Netlify, or Render (free tier) |
| Supabase DB | Supabase Free Tier (sufficient for personal use) |
| Ollama AI | Must run locally — expose via ngrok/Cloudflare Tunnel |

---

## 15. Known Pitfalls & Architectural Decisions

### 15.1 Multi-Query Hallucination Problem

**Problem:** The LLM rewrites specific queries (e.g., "STAGE 3 scoring logic") into broad synonyms ("Control Techniques for Power Quality"), missing exact document terms.

**Solution:** Implemented bypass heuristic — if query is ≤ 2 words OR matches structured patterns (`stage N`, `scoring`, `marks`, etc.), skip multi-query entirely and use the original query for maximum precision.

### 15.2 Header vs. Table Chunking Disconnect

**Problem:** Semantic chunking splits a section header ("STAGE 3") from its adjacent scoring table into different chunks. Vector search finds the header but can't link the table.

**Solution:** Two-pass keyword pinning — directly search for the stage label via ILIKE, then search for scoring keywords (marks, tools, sliders) separately, and pin both at the top of the context window.

### 15.3 Pipeline Latency (18-20s → 6-9s)

**Problem:** Multi-query LLM call blocked retrieval execution, and sending 15+ full chunks (~15,000 chars) caused slow generation.

**Solutions:**
- 8-second `AbortController` timeout on multi-query generation
- 6000 character hard-cap on assembled context
- Drop to original query on multi-query timeout

### 15.4 Zero-Latency Auto-Audit

**Problem:** Full LLM-as-Judge evaluation added 8-10 seconds per response.

**Solution:** Replaced real-time LLM audit with rule-based N-gram overlap checks that execute in ~0ms with no additional LLM calls. Full RAGAS evaluation is still available as a separate endpoint for batch testing.

---

> **End of Documentation**
