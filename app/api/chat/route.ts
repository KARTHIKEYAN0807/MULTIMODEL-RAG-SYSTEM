import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// ─── Embedding Helper ───────────────────────────────────────────────────────
async function getOllamaEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mxbai-embed-large', prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embedding failed: ${await res.text()}`);
  const data = await res.json();
  return data.embedding;
}

// ─── Rule-Based RAGAS Audit (no second LLM call = zero latency overhead) ─────
// ─── RAGAS-style Evaluation Helpers ─────────────────────────────────────────
const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from',
  'is','are','was','were','be','been','have','has','had','do','does','did','will',
  'would','could','should','may','might','any','this','that','these','those',
  'what','which','who','when','where','why','how','give','some','like','about',
  'your','you','can','also','than','done','have','they','them','their','there',
  'then','into','over','more','very','just','such','each','both','its','been',
  'after','other','than','only','before','since','during'
]);

function tokenizeContent(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

// ─── FAITHFULNESS: Unigram content-word grounding ────────────────────────────
// What fraction of meaningful words in the answer appear in the context?
// More robust than bigram overlap — handles paraphrasing naturally.
function computeFaithfulness(answer: string, context: string): number {
  const answerTokens = tokenizeContent(answer);
  const contextSet = new Set(tokenizeContent(context));
  // Filter to content words only (skip stop words, keep numbers)
  const contentWords = answerTokens.filter(w =>
    (w.length > 2 && !STOP_WORDS.has(w)) || /^\d+$/.test(w)
  );
  if (contentWords.length === 0) return 0;
  const grounded = contentWords.filter(w => contextSet.has(w));
  return grounded.length / contentWords.length;
}

// ─── RELEVANCY: Question-type-aware satisfaction check ───────────────────────
// Instead of raw keyword overlap, check if the answer satisfies the intent
// of the question based on its type (factual, explanatory, procedural, listing).
function computeRelevancy(question: string, answer: string): number {
  const q = question.toLowerCase();
  const a = answer.toLowerCase();
  const answerWords = tokenizeContent(answer).filter(w => !STOP_WORDS.has(w) && w.length > 2);

  // ── 1. Question-type satisfaction (hard checks per question intent) ──
  const questionTypeSatisfied = (() => {
    // Factual: marks, points, score value
    if (/\b(how\s+many|how\s+much|what\s+is\s+the|total)\s*(mark|marks|point|points|score)/i.test(question)
        || /\b(mark|marks|points?)\b/i.test(question)) {
      return /\b\d+\s*(mark|marks|point|points)/i.test(answer);
    }
    // Factual: time, duration, seconds
    if (/\b(how\s+long|how\s+much\s+time|time|timer|duration|seconds?|minutes?)\b/i.test(question)) {
      return /\b\d+\s*(second|seconds|minute|minutes|sec|min|s\b)/i.test(answer) || /timer/i.test(answer);
    }
    // Explanatory: what, explain, describe
    if (/^(what|explain|describe|tell\s+me)/i.test(question.trim())) {
      return answerWords.length >= 15;
    }
    // Procedural: how do, how can, how to, steps
    if (/^how\s+(do|can|to|should|would)/i.test(question.trim()) || /\bsteps?\b/.test(q)) {
      return answerWords.length >= 10;
    }
    // Listing: list, name, which
    if (/^(list|name|which|what\s+are)/i.test(question.trim())) {
      return answerWords.length >= 8 || /[-•*]|\d+\./.test(answer);
    }
    // Yes/no questions: does, is, are, can → short answer OK
    if (/^(does|is|are|can|has|have|will|should|would|did)/i.test(question.trim())) {
      return /\b(yes|no|correct|incorrect|true|false|indeed)\b/i.test(answer) || answerWords.length >= 5;
    }
    // Default: answer has substance
    return answerWords.length >= 5;
  })();

  // ── 2. Key term overlap (entities, numbers, domain terms) ───────────────
  // Synonym normalization: map common LLM paraphrase verbs to question stems
  // so "depicts" matches "describe", "displays" matches "show", etc.
  const SYNONYMS: Record<string, string> = {
    depicts: 'describe', displayed: 'show', displays: 'show', shows: 'show',
    showing: 'show', contains: 'describe', presenting: 'describe',
    illustrated: 'describe', illustrates: 'describe', featuring: 'describe',
    features: 'describe', represents: 'describe', representing: 'describe',
  };
  const normalizeToken = (w: string) => SYNONYMS[w] ?? w;

  const keyTerms = tokenizeContent(question).filter(w =>
    (w.length > 3 && !STOP_WORDS.has(w)) || /^\d+$/.test(w)
  );
  const answerTokensNorm = new Set(tokenizeContent(answer).map(normalizeToken));
  const matched = keyTerms.filter(t => answerTokensNorm.has(t));
  const termRatio = keyTerms.length > 0 ? matched.length / keyTerms.length : 0;
  // >= 0.5 (not strict >) so exact 50% match correctly scores 5
  const termScore = termRatio >= 0.5 ? 5 : termRatio > 0.35 ? 4 : termRatio > 0.2 ? 3 : termRatio > 0.1 ? 2 : 1;

  // ── 3. Combine scores ─────────────────────────────────────────────────────
  // If the answer satisfies the question's structural intent (questionTypeSatisfied)
  // AND has decent term alignment (termScore >= 4), the answer is genuinely relevant → 5
  // If only one condition holds → floor at 4 (satisfactory but not perfect)
  if (questionTypeSatisfied && termScore >= 4) return 5;
  if (questionTypeSatisfied) return 4;
  return termScore;
}

function ruleBasedAudit(question: string, answer: string, context: string): { f: number; r: number } {
  const isNoInfo = answer.toLowerCase().includes('do not have enough information');
  if (isNoInfo) return { f: 1, r: 1 };

  // Faithfulness: grounded content-word ratio
  const groundingRatio = computeFaithfulness(answer, context);
  const f = groundingRatio > 0.55 ? 5 : groundingRatio > 0.40 ? 4 : groundingRatio > 0.25 ? 3 : groundingRatio > 0.10 ? 2 : 1;

  // Relevancy: question-type-aware
  const r = computeRelevancy(question, answer);

  return { f, r };
}

async function runBackgroundAudit(question: string, answer: string, context: string, elapsedMs: number) {
  await new Promise(res => setTimeout(res, 200));
  console.log(`\n🔍 [AUTO-AUDIT] Running RAGAS-style health check...`);
  try {
    const { f, r } = ruleBasedAudit(question, answer, context);
    const status = f >= 4 && r >= 4 ? '✅ PASS' : (f <= 2 || r <= 2 ? '❌ FAIL' : '⚠️ WARN');
    const timeStr = `${(elapsedMs / 1000).toFixed(2)}s`;
    console.log(`\n┌───────────────── AI SELF-AUDIT REPORT ─────────────────┐`);
    console.log(`│ Question: ${question.substring(0, 43)}${question.length > 43 ? '...' : ''}`);
    console.log(`│ Latency:  ${timeStr.padEnd(43)}`);
    console.log(`├───────────────────────────────────────────────────────┤`);
    console.log(`│ FAITHFULNESS (Grounding): [${'★'.repeat(f)}${'☆'.repeat(5 - f)}] ${f}/5`);
    console.log(`│ ANSWER RELEVANCY:         [${'★'.repeat(r)}${'☆'.repeat(5 - r)}] ${r}/5`);
    console.log(`├───────────────────────────────────────────────────────┤`);
    console.log(`│ STATUS:  [${status}] Audit Complete`);
    console.log(`└───────────────────────────────────────────────────────┘\n`);
  } catch (e) {
    console.log(`\n⚠️ [AUTO-AUDIT] Internal evaluation error:`, e);
  }
}

// ─── Multi-Query Generation ─────────────────────────────────────────────────
// Patterns that indicate structured document queries — synonyms will hurt retrieval
const BYPASS_PATTERNS = [
  /stage\s*\d/i, /scoring\s*(logic|rubric|criteria)/i, /how\s+many\s+(marks|points)/i,
  /\d+\s*marks?/i, /assessment\s+criteria/i, /grading/i, /checklist/i,
  /selection\s+criteria/i, /eligibility/i, /qualify/i, /score\s*breakdown/i,
];

async function generateMultiQueries(originalQuery: string): Promise<string[]> {
  const wordCount = originalQuery.trim().split(/\s+/).length;
  // Bypass for very short queries
  if (wordCount <= 2) {
    console.log(`Short query detected — bypassing multi-query.`);
    return [originalQuery];
  }
  // Bypass for structured/criteria queries to avoid hallucinated synonym expansion
  if (BYPASS_PATTERNS.some(p => p.test(originalQuery))) {
    console.log(`Structured/criteria query detected — bypassing multi-query to preserve precision.`);
    return [originalQuery];
  }

  try {
    // Add an 8-second timeout so multi-query never blocks retrieval
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'llama3.2',
        messages: [
          {
            role: 'system',
            content: `You are a search query generator. Given a user question, generate exactly 3 different search queries that would help find relevant information.
Each query should approach the topic from a different angle (synonyms, broader context, specific details).
Return ONLY 3 lines, one query per line. No numbering, no prefixes, no explanations.`
          },
          { role: 'user', content: originalQuery }
        ],
        stream: false,
        options: { num_ctx: 2048 }
      })
    });
    clearTimeout(timeout);
    if (!res.ok) return [originalQuery];

    const data = await res.json();
    const rawText = data.message?.content?.trim() || '';
    const queries = rawText
      .split('\n')
      .map((q: string) => q.replace(/^["'\-\d.\s]+|["'\s]+$/g, '').trim())
      .filter((q: string) => q.length > 5 && !q.toLowerCase().includes('here are'));

    if (queries.length === 0) return [originalQuery];
    console.log('Multi-queries generated:', queries);
    return Array.from(new Set([originalQuery, ...queries]));
  } catch (e: any) {
    if (e.name === 'AbortError') console.warn('Multi-query timed out — falling back to original query.');
    else console.error('Multi-query generation failed:', e);
    return [originalQuery];
  }
}

// ─── Reciprocal Rank Fusion ───────────────────────────────────────────────────
interface ScoredDoc {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
  search_type?: string;
  rrf_score?: number;
}

function reciprocalRankFusion(resultSets: ScoredDoc[][], k: number = 60): ScoredDoc[] {
  const docScores = new Map<string, { doc: ScoredDoc; score: number }>();

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const doc = results[rank];
      const rrfScore = 1 / (k + rank + 1);
      const existing = docScores.get(doc.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        docScores.set(doc.id, { doc, score: rrfScore });
      }
    }
  }

  return Array.from(docScores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ doc, score }) => ({ ...doc, rrf_score: score }));
}

// ─── Main POST Handler ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const messages = body.messages;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages array is required and cannot be empty" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const latestMessageObj = messages[messages.length - 1];
    const latestMessage = latestMessageObj.content;

    // ─── DIRECT IMAGE ROUTING ───────────────────────────────────────────
    if (latestMessageObj.image) {
      console.log("Direct Image query detected, routing to moondream...");

      const pMessages = messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        ...(m.image ? { images: [m.image] } : {})
      }));

      const moondreamResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'moondream',
          messages: pMessages,
          stream: true
        })
      });

      if (!moondreamResponse.ok) {
        throw new Error(`Moondream failed: ${await moondreamResponse.text()}`);
      }

      return createOllamaStreamResponse(moondreamResponse, [], latestMessage, "Direct Vision Query (No RAG context)", startTime);
    }

    // ─── STEP 1 & 2: Contextual Query Reformulation & Multi-Query ───────
    let searchPrompt = latestMessage;
    const multiQueries = await generateMultiQueries(searchPrompt);

    // ─── STEP 3: Run Hybrid Search for each query & collect result sets ─
    const allResultSets: ScoredDoc[][] = [];

    const searchPromises = multiQueries.map(async (query) => {
      const embedding = await getOllamaEmbedding(query);

      // Try hybrid_search first, fall back to match_documents
      let docs: ScoredDoc[] = [];
      try {
        const { data, error } = await supabase.rpc('hybrid_search', {
          query_text: query,
          query_embedding: embedding,
          match_count: 15,
          vector_weight: 0.65,
          text_weight: 0.35,
          match_threshold: 0.005 // Very low threshold — avoid silently dropping sparse scoring/table chunks
        });

        if (error) {
          console.warn("hybrid_search failed, falling back to match_documents:", error.message);
          // Fallback to original vector-only search
          const { data: fallbackData, error: fallbackError } = await supabase.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: 0.005,
            match_count: 15,
          });
          if (!fallbackError && fallbackData) docs = fallbackData;
        } else {
          docs = data || [];
        }
      } catch (e) {
        console.error("Search error for query:", query, e);
      }

      return docs;
    });

    const resultsSets = await Promise.all(searchPromises);
    resultsSets.forEach(docs => {
      if (docs.length > 0) allResultSets.push(docs);
    });

    // ─── STEP 4: Reciprocal Rank Fusion ─────────────────────────────────
    const fusedResults = reciprocalRankFusion(allResultSets);
    const topDocuments = fusedResults.slice(0, 10);

    console.log(`Multi-Query RRF: ${multiQueries.length} queries → ${allResultSets.reduce((s, r) => s + r.length, 0)} raw results → ${fusedResults.length} unique → top ${topDocuments.length} selected`);

    // ─── STEP 5: Assemble context and extract Citations ─────────────────
    let contextText = "";
    const sources = new Set<string>();
    const lowerQuery = latestMessage.toLowerCase();

    // ─── KEYWORD PINNING: Two-pass approach to capture header + scoring table ─
    // Pass 1: Chunks that literally contain "stage N" (header sections)
    // Pass 2: Chunks that contain scoring-specific keywords for that stage
    // This handles the common chunking pattern where the header and its table
    // are split across chunk boundaries.
    const stageMatch = latestMessage.match(/stage\s*(\d+)/i);
    let pinnedContext = "";
    const pinnedIds = new Set<string>();

    if (stageMatch) {
      const stageNum = stageMatch[1];
      const stageLabel = `stage ${stageNum}`; // e.g. "stage 3"

      // Pass 1 — chunks containing the stage label
      const { data: pass1Docs } = await supabase
        .from('documents')
        .select('id, content, metadata')
        .ilike('content', `%${stageLabel}%`)
        .limit(6);

      const pass1 = pass1Docs || [];
      pass1.forEach((d: any) => pinnedIds.add(d.id));

      // Pass 2 — scoring-keyword chunks (the table rows that don't repeat the stage name)
      // These terms are common in scoring rubric rows that belong to Stage 3
      const scoringKeywords = [
        'tools', 'checkboxes', 'sliders', 'subjects studied',
        'self-rat', 'circuit analysis', 'control systems',
        'total sum', 'marks', 'scoring criteria'
      ];
      // Build OR filter: content ilike any of the scoring keywords
      const orFilter = scoringKeywords.map(k => `content.ilike.%${k}%`).join(',');
      const { data: pass2Docs } = await supabase
        .from('documents')
        .select('id, content, metadata')
        .or(orFilter)
        .limit(8);

      const pass2 = (pass2Docs || []).filter((d: any) => !pinnedIds.has(d.id));
      pass2.forEach((d: any) => pinnedIds.add(d.id));

      const allPinned = [...pass1, ...pass2];

      if (allPinned.length > 0) {
        pinnedContext = `[PINNED — ${stageLabel.toUpperCase()} CONTENT + SCORING TABLE FROM DOCUMENT]:\n` +
          allPinned.map((d: any) => d.content).join('\n\n---\n\n') + '\n\n';
        allPinned.forEach((d: any) => {
          if (d.metadata?.source) sources.add(d.metadata.source);
        });
        console.log(`Keyword-pinned ${pass1.length} stage-label chunks + ${pass2.length} scoring-keyword chunks for "${stageLabel}"`);
      }
    }

    // ─── STEP X: Force-Inject Recent Image context ───────────────────────
    let recentImageContext = "";
    if (lowerQuery.includes('image') || lowerQuery.includes('picture') || lowerQuery.includes('photo')) {
      const { data: imageDocs } = await supabase
        .from('documents')
        .select('*')
        .eq('metadata->>type', 'image')
        .order('created_at', { ascending: false })
        .limit(1);

      if (imageDocs && imageDocs.length > 0) {
        recentImageContext = `[RECENTLY UPLOADED IMAGE ANALYSIS]:\n${imageDocs[0].content}\n\n`;
        sources.add(imageDocs[0].metadata?.source || "Uploaded Image");
      }
    }

    // Assemble: pinned chunks first (highest precision), then vector results
    // Raised to 6000 chars so scoring tables with multiple rows aren't truncated
    const CONTEXT_CHAR_LIMIT = 6000;
    if (pinnedContext || topDocuments.length > 0 || recentImageContext) {
      // De-duplicate: skip vector docs already captured by pinning
      const vectorChunks = topDocuments
        .filter((doc) => !pinnedIds.has(doc.id))
        .map((doc) => doc.content)
        .join("\n\n---\n\n");

      let assembled = pinnedContext + recentImageContext + vectorChunks;
      contextText = assembled.length > CONTEXT_CHAR_LIMIT
        ? assembled.slice(0, CONTEXT_CHAR_LIMIT) + "\n...[context truncated — ask for more detail if needed]"
        : assembled;
      topDocuments.forEach((doc) => {
        if (doc.metadata?.source) sources.add(doc.metadata.source);
      });
    }

    // ─── STEP 6: Create the final prompt ────────────────────────────────
    const hasContext = contextText.trim().length > 0;

    // Build a stage-focus hint so the LLM doesn't confuse Stage 3 content with Q2, Q3 etc.
    const stageFocusHint = stageMatch
      ? `\nIMPORTANT: The user is asking specifically about STAGE ${stageMatch[1]}. Focus ONLY on content tagged or described as Stage ${stageMatch[1]}. Do NOT answer using content from other stages.\n`
      : '';

    const systemPrompt = hasContext
      ? `You are a precise AI assistant that answers questions using ONLY the provided document context.
${stageFocusHint}
RULES:
1. Answer using ONLY information from the context below. Do NOT use outside knowledge.
2. If the context contains scoring criteria, marks, or rubrics — quote them exactly as they appear.
3. Structure your answer clearly: use bullet points or a table if the source uses them.
4. Be concise and directly answer the user's question.
5. In your answer, naturally use the key terms and subject matter from the user's question (e.g. if asked about "marks and time", explicitly mention marks and time in your answer).
6. Ground every fact you state in the context — use the exact words or numbers from the document where possible.

Context:
${contextText}
`
      : `You are a precise AI assistant.
No relevant document chunks were found matching this query.
Respond with: "I do not have enough information based on the provided documents."
Suggest the user upload or re-index the relevant document.`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))
    ];

    // ─── STEP 7: Stream response from Ollama ────────────────────────────
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        messages: chatMessages,
        stream: true,
        options: { num_ctx: 4096, temperature: 0.0 }
      })
    });

    if (!ollamaResponse.ok) {
      const errBody = await ollamaResponse.text();
      console.error('Ollama error body:', errBody);
      throw new Error(`Ollama chat failed (${ollamaResponse.status}): ${errBody}`);
    }

    return createOllamaStreamResponse(ollamaResponse, Array.from(sources), latestMessage, contextText, startTime);

  } catch (error: any) {
    console.error("Chat Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// ─── Stream Helper ──────────────────────────────────────────────────────────
function createOllamaStreamResponse(ollamaResponse: Response, sources: string[], question: string, context: string, startTime: number) {
  const reader = ollamaResponse.body?.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      let fullAssistantMessage = '';

      function push() {
        reader?.read().then(({ done, value }) => {
          if (done) {
            // End of stream - Trigger background audit
            if (fullAssistantMessage.length > 0) {
              const elapsedMs = Date.now() - startTime;
              runBackgroundAudit(question, fullAssistantMessage, context, elapsedMs);
            }

            if (buffer.trim()) {
              try {
                const parsed = JSON.parse(buffer);
                if (parsed.message?.content) {
                  controller.enqueue(encoder.encode(parsed.message.content));
                  fullAssistantMessage += parsed.message.content;
                }
              } catch (e) { }
            }
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                const content = parsed.message.content;
                controller.enqueue(encoder.encode(content));
                fullAssistantMessage += content;
              }
            } catch (e) { }
          }
          push();
        }).catch(err => {
          controller.error(err);
        });
      }
      push();
    }
  });

  const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
  if (sources.length > 0) {
    headers['X-Sources'] = Buffer.from(JSON.stringify(sources)).toString('base64');
  }

  return new Response(stream, { headers });
}
