/**
 * Multimodal RAG Engine - Client Implementation Guide
 * 
 * Copy and paste this snippet into any future project to connect it 
 * to your custom RAG engine.
 */

const RAG_ENGINE_URL = "http://localhost:3000"; // Or your Docker IP
const API_KEY = "rag_admin_secret_2026"; // From your .env.local

export async function getRAGContext(userQuery: string) {
  try {
    const response = await fetch(`${RAG_ENGINE_URL}/api/rag/retrieve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({ query: userQuery })
    });

    if (!response.ok) {
      throw new Error(`RAG Engine error: ${response.statusText}`);
    }

    const data = await response.json();
    
    /**
     * Data structure returned:
     * {
     *   query: "...",
     *   full_context_text: "...", // Pre-formatted string ready for your LLM prompt
     *   context: {
     *     text_chunks: [...],
     *     image_analysis: { description: "...", source: "..." }
     *   }
     * }
     */
    return data.full_context_text;

  } catch (error) {
    console.error("Failed to fetch context from RAG Engine:", error);
    return "";
  }
}

/**
 * EXAMPLE USAGE in a future LLM project:
 * 
 * const context = await getRAGContext("How do buck converters work?");
 * 
 * const finalPrompt = `
 *   Use the following provided context to answer the user question.
 *   Context: ${context}
 *   Question: How do buck converters work?
 * `;
 */
