import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

export interface ScoredDoc {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
  search_type?: string;
  rrf_score?: number;
}

// ─── Embedding Helper (Local Ollama) ────────────────────────────────────────
export async function getOllamaEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mxbai-embed-large', prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embedding failed: ${await res.text()}`);
  const data = await res.json();
  return data.embedding;
}

// ─── Multi-Query Generation (Local Ollama) ───────────────────────────────────
export async function generateMultiQueries(originalQuery: string): Promise<string[]> {
  const wordCount = originalQuery.trim().split(/\s+/).length;
  if (wordCount <= 2) {
    return [originalQuery];
  }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    if (!res.ok) return [originalQuery];

    const data = await res.json();
    const rawText = data.message?.content?.trim() || '';
    const queries = rawText
      .split('\n')
      .map((q: string) => q.replace(/^["'\-\d.\s]+|["'\s]+$/g, '').trim())
      .filter((q: string) => q.length > 5 && !q.toLowerCase().includes('here are'));

    if (queries.length === 0) return [originalQuery];
    return Array.from(new Set([originalQuery, ...queries]));
  } catch (e) {
    console.error('Multi-query generation failed:', e);
    return [originalQuery];
  }
}

// ─── Reciprocal Rank Fusion ───────────────────────────────────────────────────
export function reciprocalRankFusion(resultSets: ScoredDoc[][], k: number = 60): ScoredDoc[] {
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

// ─── Hybrid Search Engine ─────────────────────────────────────────────────────
export async function performFullRetrieval(query: string) {
  // 1. Generate Multi-Queries
  const multiQueries = await generateMultiQueries(query);
  const allResultSets: ScoredDoc[][] = [];

  // 2. Execute searches
  const searchPromises = multiQueries.map(async (q) => {
    const embedding = await getOllamaEmbedding(q);
    let docs: ScoredDoc[] = [];
    try {
      const { data, error } = await supabase.rpc('hybrid_search', {
        query_text: q,
        query_embedding: embedding,
        match_count: 15,
        vector_weight: 0.7,
        text_weight: 0.3,
        match_threshold: 0.05
      });

      if (error) {
        const { data: fallbackData } = await supabase.rpc('match_documents', {
          query_embedding: embedding,
          match_threshold: 0.05,
          match_count: 15,
        });
        if (fallbackData) docs = fallbackData;
      } else {
        docs = data || [];
      }
    } catch (e) {
      console.error("Search error:", e);
    }
    return docs;
  });

  const resultsSets = await Promise.all(searchPromises);
  resultsSets.forEach(docs => {
    if (docs.length > 0) allResultSets.push(docs);
  });

  // 3. Fusion
  const fusedResults = reciprocalRankFusion(allResultSets);

  // 4. Heuristic: Dedicated Image Retrieval
  let imageContext = "";
  let imageSource = "";
  const lowerQuery = query.toLowerCase();

  const cleanQuery = lowerQuery.replace(/[^\w\s]/g, '').trim();
  const queryWords = cleanQuery.split(/\s+/).filter((w: string) => w.length > 2);
  
  let imgSearchQuery = supabase
    .from('documents')
    .select('id, content, metadata')
    .eq('metadata->>type', 'image');

  if (queryWords.length > 0) {
    const orConditions = queryWords.map((w: string) => `metadata->>source.ilike.%${w}%,content.ilike.%${w}%`).join(',');
    imgSearchQuery = imgSearchQuery.or(orConditions);
  }

  const { data: matchingImages, error: imgSearchError } = await imgSearchQuery.limit(1);

  if (!imgSearchError && matchingImages && matchingImages.length > 0) {
    imageContext = `[RELEVANT IMAGE MATCH (Source: ${matchingImages[0].metadata?.source || "Uploaded Image"})]:\n${matchingImages[0].content}\n\n`;
    imageSource = matchingImages[0].metadata?.source || "Uploaded Image";
  } else if (lowerQuery.includes('image') || lowerQuery.includes('picture') || lowerQuery.includes('photo')) {
    const { data: imageDocs } = await supabase
      .from('documents')
      .select('*')
      .eq('metadata->>type', 'image')
      .order('created_at', { ascending: false })
      .limit(1);

    if (imageDocs && imageDocs.length > 0) {
      imageContext = `[RECENTLY UPLOADED IMAGE ANALYSIS (Fallback)]:\n${imageDocs[0].content}\n\n`;
      imageSource = imageDocs[0].metadata?.source || "Uploaded Image";
    }
  }

  return {
    topDocuments: fusedResults.slice(0, 12),
    imageContext,
    imageSource,
    multiQueries
  };
}