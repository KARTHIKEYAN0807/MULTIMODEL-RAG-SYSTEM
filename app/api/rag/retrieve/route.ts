import { performFullRetrieval } from '@/lib/rag-engine';

export async function POST(req: Request) {
  try {
    // 1. Simple API Key Security
    const authHeader = req.headers.get('Authorization');
    const expectedKey = process.env.RAG_API_KEY;

    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid API Key" }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: "Query string is required" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[RAG ENGINE] Processing headless retrieval for: "${query.substring(0, 50)}..."`);

    // 2. Perform advanced retrieval
    const startTime = Date.now();
    const result = await performFullRetrieval(query);
    const duration = Date.now() - startTime;

    // 3. Return raw JSON context for the external LLM to use
    return new Response(JSON.stringify({
      query,
      retrieval_stats: {
        duration_ms: duration,
        multi_queries_used: result.multiQueries,
        docs_found: result.topDocuments.length,
        has_image_context: !!result.imageContext
      },
      context: {
        text_chunks: result.topDocuments.map(d => ({
          content: d.content,
          source: d.metadata?.source || 'Unknown',
          score: d.rrf_score
        })),
        image_analysis: result.imageContext ? {
          description: result.imageContext,
          source: result.imageSource
        } : null
      },
      // Helper for external prompts:
      full_context_text: (result.imageContext + result.topDocuments.map(d => d.content).join("\n\n---\n\n")).trim()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("[RAG ENGINE ERROR]:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
