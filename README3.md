# 🧠 Local Multimodal RAG System

> **An advanced, privacy-first Retrieval-Augmented Generation system** that runs entirely on your local machine. Upload PDFs and images, ask natural language questions, and get AI-powered answers grounded in your documents — with full source citations, vision AI analysis, and enterprise-grade retrieval techniques.

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)
![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-white?logo=ollama)
![Supabase](https://img.shields.io/badge/Supabase-pgvector-3ECF8E?logo=supabase)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [RAG Pipeline](#-rag-pipeline-deep-dive)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [RAGAS Evaluation](#-ragas-evaluation)
- [API Reference](#-api-reference)
- [Advanced Techniques Used](#-advanced-techniques-used)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📄 **PDF Ingestion** | Extracts text with semantic paragraph-aware chunking + 200-char sliding window overlap |
| 🖼️ **Image Analysis** | Moondream vision AI extracts captions from uploaded images and embedded PDF images |
| 💬 **Streaming Chat** | Real-time token-by-token streaming with buffered NDJSON parsing |
| 🔍 **Multi-Query Fusion** | Generates 3 search perspectives per question, fuses results via Reciprocal Rank Fusion (RRF) |
| 🔗 **Hybrid Search** | Combines pgvector cosine similarity (70%) + Postgres BM25 full-text search (30%) |
| 🔄 **Query Reformulation** | Rewrites follow-up questions into standalone search queries using chat history context |
| 📎 **Drag & Drop Vision** | Drop images directly into the chat to ask questions — routes to Moondream vision model |
| 📑 **Source Citations** | Every AI response shows which source files were used (via `X-Sources` HTTP header) |
| 🗂️ **File Management** | View, count, and delete indexed files with their chunk counts |
| 📊 **RAGAS Evaluation** | Built-in LLM-as-a-Judge evaluation endpoint measuring Faithfulness, Relevancy, Precision, and Quality |
| 🎨 **Premium UI** | Glassmorphism design with gradient accents, markdown rendering, syntax highlighting, and smooth animations |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Next.js Client)                     │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │ ChatUI   │  │ Upload   │  │ FileManager │  │   Markdown    │   │
│  │ (stream) │  │ (drag&   │  │ (CRUD)      │  │   Renderer    │   │
│  │          │  │  drop)   │  │             │  │ (react-md)    │   │
│  └────┬─────┘  └────┬─────┘  └──────┬──────┘  └───────────────┘   │
│       │              │               │                               │
└───────┼──────────────┼───────────────┼───────────────────────────────┘
        │              │               │
        ▼              ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      NEXT.JS API ROUTES (Server)                     │
│                                                                      │
│  POST /api/chat ──────────────────────────────────────────────────  │
│  │                                                                │  │
│  │  1. Input Validation                                           │  │
│  │  2. Image Detection → [moondream bypass]                       │  │
│  │  3. Query Reformulation (multi-turn context)                   │  │
│  │  4. Multi-Query Generation (3 search perspectives)             │  │
│  │  5. Hybrid Search (vector + keyword) × 3 queries               │  │
│  │  6. Reciprocal Rank Fusion (merge & re-rank)                   │  │
│  │  7. Context Assembly + Citation Extraction                     │  │
│  │  8. LLM Streaming Response                                    │  │
│  │                                                                │  │
│  POST /api/upload ────────────────────────────────────────────────  │
│  │  PDF: Semantic Chunking → Overlap → Embed → Store              │  │
│  │  IMG: Moondream Caption → Embed → Store                        │  │
│  │  PDF Images: JPEG Extraction → Moondream → Embed → Store      │  │
│  │                                                                │  │
│  GET/DELETE /api/files ───────────────────────────────────────────  │
│  │  List unique sources, delete by filename                       │  │
│  │                                                                │  │
│  POST /api/evaluate ──────────────────────────────────────────────  │
│  │  RAGAS-style LLM-as-Judge evaluation                           │  │
│  │                                                                │  │
└───────┬──────────────┬───────────────────────────────────────────────┘
        │              │
        ▼              ▼
┌──────────────┐  ┌──────────────────────────────────────────────┐
│   OLLAMA     │  │              SUPABASE (Cloud)                │
│  (Local AI)  │  │                                              │
│              │  │  ┌────────────────────────────────────────┐  │
│  llama3.2    │  │  │          documents table               │  │
│  (3B, Chat)  │  │  │  id | content | metadata | embedding  │  │
│              │  │  │     | fts (tsvector)                   │  │
│  nomic-embed │  │  │                                        │  │
│  (Embedding) │  │  │  match_documents() — vector search     │  │
│              │  │  │  hybrid_search() — vector + keyword    │  │
│  moondream   │  │  └────────────────────────────────────────┘  │
│  (Vision AI) │  │                                              │
│              │  │  ┌────────────────────────────────────────┐  │
└──────────────┘  │  │        images storage bucket           │  │
                  │  └────────────────────────────────────────┘  │
                  └──────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16.2 (Turbopack) | React server/client framework |
| **Styling** | Tailwind CSS 4 | Utility-first styling with glassmorphism design system |
| **Markdown** | react-markdown + remark-gfm + rehype-highlight | Renders AI responses with tables, code highlighting |
| **LLM (Text)** | Ollama — `llama3.2` (3B params) | Local text generation and query reformulation |
| **LLM (Vision)** | Ollama — `moondream` | Local image captioning and visual Q&A |
| **Embeddings** | Ollama — `nomic-embed-text` (768-dim) | Local vector embedding generation |
| **Vector DB** | Supabase + pgvector | Cosine similarity search on 768-dim vectors |
| **Full-Text Search** | Postgres tsvector + GIN index | BM25-style keyword matching |
| **Storage** | Supabase Storage | Image file storage for uploaded/extracted images |
| **Language** | TypeScript 5 | End-to-end type safety |

---

## 🔬 RAG Pipeline Deep Dive

### 1. Document Ingestion (`/api/upload`)

```
PDF Upload
    │
    ├── Text Extraction (pdf-parse)
    │       │
    │       ├── Semantic Chunking
    │       │    Split by paragraphs (\\n\\n), then sentences
    │       │    Target size: 1000 chars per chunk
    │       │
    │       ├── Sliding Window Overlap
    │       │    200-char overlap between adjacent chunks
    │       │    Prevents context loss at boundaries
    │       │
    │       └── Embedding + Storage
    │            nomic-embed-text → 768-dim vector → Supabase
    │
    └── JPEG Image Extraction
            │
            ├── Binary marker scan (FFD8→FFD9)
            ├── Moondream vision captioning
            └── Caption → Embed → Store
```

### 2. Query Processing (`/api/chat`)

```
User Question: "How does the funding evaluation work?"
    │
    ├── [A] Image attached? → Route to Moondream (bypass RAG)
    │
    ├── [B] Multi-turn? → Query Reformulation
    │       "Tell me more" → "Detailed explanation of startup funding evaluation criteria"
    │
    ├── [C] Multi-Query Generation (3 perspectives)
    │       Query 1: "startup funding evaluation process"
    │       Query 2: "criteria for evaluating startup investments"
    │       Query 3: "scoring rubric for venture applications"
    │
    ├── [D] Hybrid Search × 3 queries
    │       Each query runs:
    │         • pgvector cosine similarity (weight: 0.7)
    │         • Postgres BM25 full-text search (weight: 0.3)
    │
    ├── [E] Reciprocal Rank Fusion
    │       Score = Σ 1/(k + rank) across all result sets
    │       Merge, deduplicate, select top 6
    │
    ├── [F] Context Assembly + System Prompt
    │       Inject top-6 chunks into LLM context window
    │
    └── [G] Streaming Response
            llama3.2 → NDJSON buffer → text stream → browser
            + X-Sources header with Base64-encoded citations
```

### 3. Advanced Retrieval Techniques

| Technique | What it does | Why it matters |
|-----------|-------------|----------------|
| **Semantic Chunking** | Splits by paragraphs & sentences instead of character count | Preserves meaning boundaries |
| **Chunk Overlap** | 200-char sliding window between adjacent chunks | Prevents boundary context loss |
| **Query Reformulation** | Rewrites vague follow-ups into explicit standalone queries | Fixes "what is *it*?" problems |
| **Multi-Query Generation** | Creates 3 search angles per question | Improves recall on complex queries |
| **Reciprocal Rank Fusion** | Mathematically merges results from multiple searches | Same algorithm used by Elasticsearch |
| **Hybrid Search** | Combines vector (semantic) + keyword (exact match) search | Catches both meaning and exact terms |
| **NDJSON Stream Buffering** | Accumulates partial JSON across TCP chunks | Prevents dropped words in streaming |

---

## 🐛 Common RAG Pitfalls & Solutions (Architecture Notes)

This system was refined by solving several complex pipeline issues. These notes serve as a reference for why certain architectural decisions were made:

### 1. The "Multi-Query Hallucination" Problem
* **Symptom:** Queries about specific, structured topics (e.g., `"STAGE 3 in power electronics scoring logic"`) returned generic, useless results.
* **Root Cause:** The multi-query text generator was rewriting the prompt into broad synonyms (e.g., `"Control Techniques for Power Quality"`), completely missing the specific document terms.
* **Solution (Query Bypass Heuristic):** We implemented a **Smart Bypass**. If a query is ≤ 2 words, OR contains structured keywords (`stage N`, `scoring logic`, `marks`, `criteria`), we completely skip the LLM multi-query step and only use the original query to preserve exact-match targeting.

### 2. The "Header vs. Table" Chunking Disconnect
* **Symptom:** The AI would find a section header like "STAGE 3", but claim there was no scoring criteria listed under it.
* **Root Cause:** The semantic chunking limit split the document right after the "STAGE 3" header. The next chunk contained the scoring table, but lacked the words "STAGE 3". Vector semantic search couldn't link them natively.
* **Solution (Two-Pass Keyword Pinning):** We implemented a deterministic override before vector search:
  1. **Pass 1:** Do a direct Postgres `ILIKE` search for the explicit stage mention (e.g. `%stage 3%`) to grab the header.
  2. **Pass 2:** Do another `ILIKE` search for common scoring keywords (`marks`, `tools`, `sliders`) to grab adjacent tables.
  3. We **pin these chunks** at the absolute top of the LLM context, guaranteeing high-precision retrieval regardless of cosine similarity.

### 3. Pipeline Latency Bottlenecks (The ~20s wait)
* **Symptom:** Chat took 18-20+ seconds to respond.
* **Root Cause:** Two bottlenecks: the multi-query LLM call blocked retriever execution, and sending 15 full chunks (~15,000+ chars) caused slow final text generation.
* **Solution:**
  - Placed an **8-second `AbortController` timeout** on the multi-query LLM call. If it hangs, it falls back to the original query.
  - Implemented a **6000 character hard-cap** on the assembled context string.
  - Result: End-to-end latency dropped to **~6-9 seconds**.

### 4. Zero-Latency RAGAS Auditing
* **Symptom:** Evaluating grounding/relevancy on every chat added an extra 8-10 seconds post-response because it required two additional `llama3.2` LLM calls.
* **Root Cause:** LLM-as-a-judge is robust but too slow for real-time streaming audits.
* **Solution:** Replaced the terminal auto-audit LLM calls with a **Rule-Based N-Gram overlap check**.
  - **Faithfulness:** Uses pure Bigram (n=2) intersection between the generated answer and retrieved context.
  - **Relevancy:** Checks ratio of original query keywords appearing in the answer.
  - Result: 0ms latency overhead, highly deterministic `✅ PASS` / `❌ FAIL` logs in terminal.

---

## 📂 Project Structure

```
multimodal-rag/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts          # Main RAG chat endpoint (streaming)
│   │   │                          #   - Query reformulation
│   │   │                          #   - Multi-query generation
│   │   │                          #   - Hybrid search + RRF
│   │   │                          #   - Image routing (moondream)
│   │   │                          #   - Citation extraction
│   │   ├── upload/
│   │   │   └── route.ts          # Document ingestion endpoint
│   │   │                          #   - PDF text extraction
│   │   │                          #   - Semantic chunking + overlap
│   │   │                          #   - JPEG image extraction
│   │   │                          #   - Moondream captioning
│   │   │                          #   - nomic-embed-text embedding
│   │   ├── files/
│   │   │   └── route.ts          # File management (GET list, DELETE)
│   │   └── evaluate/
│   │       └── route.ts          # RAGAS evaluation endpoint
│   │                              #   - Faithfulness scoring
│   │                              #   - Answer relevancy scoring
│   │                              #   - Context precision scoring
│   │                              #   - Response quality scoring
│   ├── globals.css                # Design system (glassmorphism, animations)
│   ├── layout.tsx                 # Root layout (Inter font, SEO, mesh gradient)
│   └── page.tsx                   # Main page (sidebar + chat grid)
│
├── components/
│   ├── ChatUI.tsx                 # Chat interface
│   │                              #   - Markdown rendering (react-markdown)
│   │                              #   - Drag & drop image upload
│   │                              #   - Citation badges
│   │                              #   - Streaming response display
│   ├── UploadFile.tsx             # File upload with drag & drop zone
│   └── FileManager.tsx            # Indexed files list with delete
│
├── supabase/
│   └── migrations/
│       ├── 20260402095253_init_schema.sql    # Base schema (documents, pgvector)
│       └── 20260407_hybrid_search.sql        # Hybrid search (fts, GIN index, RPC)
│
├── .env.local                     # Supabase credentials
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
└── next.config.ts                 # Next.js config
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Ollama** installed and running ([Download](https://ollama.com))
- **Supabase** project (cloud or local)

### 1. Install dependencies

```bash
npm install
```

### 2. Pull required Ollama models

```bash
ollama pull llama3.2          # 3B text generation model
ollama pull nomic-embed-text  # 768-dim embedding model
ollama pull moondream          # Vision AI model
```

### 3. Configure environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
OLLAMA_URL="http://127.0.0.1:11434"   # Optional, defaults to this
```

### 4. Run database migrations

Execute both SQL files in your Supabase Dashboard → SQL Editor:

1. `supabase/migrations/20260402095253_init_schema.sql` — Creates base schema
2. `supabase/migrations/20260407_hybrid_search.sql` — Adds hybrid search

### 5. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## ☁️ Cloud Deployment & Free Hosting

You can host parts of this project for completely free, with important considerations for the AI engine:

### 1. Frontend & API (Free)
The Next.js application (UI, Chat Interface, API routes) can be seamlessly deployed on free platforms like **Vercel**, **Netlify**, or **Render**. 

### 2. Vector Database (Free)
The application is configured to use **Supabase**, which provides a generous Free Tier more than sufficient for storing vectors, metadata, and files for personal/small projects.

### 3. AI Models / Ollama (The Catch)
Ollama runs the local LLMs (LLaMA 3, Moondream), which require significant memory and GPU power. **There are no mainstream "free" cloud providers that will run these heavy AI models 24/7.**
- **The Hybrid Solution (Free):** Host the Next.js app on Vercel. Keep Ollama running on your local PC, and use a tool like **ngrok** or **Cloudflare Tunnels** to safely expose your local Ollama port (11434) to the internet. Then set `OLLAMA_URL` in your Vercel environment variables to point to your ngrok/Cloudflare tunnel URL.
- **The Cloud API API Alternative:** If you don't want to rely on your local machine, you will need to modify the code (`lib/rag-engine.ts`) to call a free-tier cloud AI provider (like **Groq** for fast LLaMA models, or **Google Gemini API**) instead of `fetch(OLLAMA_URL)`.

---

## 📊 RAGAS Evaluation

This project includes a built-in **RAGAS-inspired evaluation system** using LLM-as-a-Judge methodology. It tests your RAG pipeline across 4 key metrics.

### Metrics

| Metric | Weight | Description |
|--------|--------|-------------|
| **Faithfulness** | 30% | Is the answer grounded in retrieved context (no hallucination)? |
| **Answer Relevancy** | 30% | Does the answer directly address the user's question? |
| **Context Precision** | 20% | Were the retrieved document chunks actually relevant? |
| **Response Quality** | 20% | Overall coherence, detail, and helpfulness |

### Running an Evaluation

```bash
# Run with default test questions
curl -X POST http://localhost:3000/api/evaluate

# Run with custom questions
curl -X POST http://localhost:3000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "questions": [
      "What is the scoring criteria?",
      "How are startups evaluated?",
      "What are the funding requirements?"
    ]
  }'
```

### Response Format

```json
{
  "totalQuestions": 3,
  "averageScores": {
    "faithfulness": 4.33,
    "answerRelevancy": 4.00,
    "contextPrecision": 3.67,
    "responseQuality": 4.33,
    "overall": 4.10
  },
  "averageLatencyMs": 8500,
  "results": [
    {
      "question": "What is the scoring criteria?",
      "answer": "Based on the context...",
      "sources": ["document.pdf"],
      "scores": { ... },
      "reasoning": { ... },
      "latencyMs": 7200
    }
  ],
  "evaluatedAt": "2026-04-07T10:30:00.000Z"
}
```

### How It Works

```
For each test question:
    │
    ├── 1. Send question to /api/chat (full RAG pipeline)
    │      Captures: answer text, sources, latency
    │
    ├── 2. LLM-as-Judge Evaluation (4 parallel prompts)
    │      Uses llama3.2 to grade each dimension 1-5
    │
    └── 3. Weighted aggregation into overall score
```

---

## 📡 API Reference

### `POST /api/chat`

Send a message and receive a streaming AI response.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `Array<{role, content, image?}>` | ✅ | Chat messages array |
| `messages[].image` | `string (base64)` | ❌ | Attached image for vision analysis |

**Response:** `text/plain` stream + `X-Sources` header (Base64 JSON of source filenames)

### `POST /api/upload`

Upload a PDF or image for ingestion.

| Field | Type | Description |
|-------|------|-------------|
| `file` | `File (multipart/form-data)` | PDF, PNG, JPG, or WEBP |

### `GET /api/files`

List all indexed files with chunk counts.

### `DELETE /api/files`

Delete all chunks for a source file. Body: `{ "source": "filename.pdf" }`

### `POST /api/evaluate`

Run RAGAS evaluation. Body: `{ "questions": ["..."] }` (optional)

---

## 🧪 Advanced Techniques Used

### Retrieval
- ✅ Semantic paragraph + sentence-aware chunking
- ✅ 200-character sliding window chunk overlap
- ✅ Contextual query reformulation (multi-turn)
- ✅ Multi-query generation (3 search perspectives)
- ✅ Reciprocal Rank Fusion (RRF) for result merging
- ✅ Hybrid search (pgvector cosine + Postgres BM25 full-text)
- ✅ Configurable vector/keyword weight ratio (70/30)

### Generation
- ✅ Streaming NDJSON with buffer accumulation (prevents dropped tokens)
- ✅ Context window management (`num_ctx` caps for VRAM safety)
- ✅ Multi-model routing (llama3.2 for text, moondream for vision)
- ✅ Graceful fallback (hybrid → vector-only if migration not applied)

### Evaluation
- ✅ RAGAS-inspired LLM-as-a-Judge evaluation
- ✅ 4-metric scoring (Faithfulness, Relevancy, Precision, Quality)
- ✅ Weighted aggregation with per-question reasoning

### Frontend
- ✅ Markdown rendering with syntax highlighting
- ✅ Glassmorphism design system with gradient mesh background
- ✅ Drag & drop image upload with preview
- ✅ Source citation badges on AI responses
- ✅ File management panel with CRUD operations
- ✅ Smooth fade-in animations and micro-interactions

---

## 📄 License

MIT License. Built with ❤️ using local AI.