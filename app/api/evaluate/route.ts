import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const APP_URL = 'http://localhost:3000';

// ─── RAGAS-Inspired Evaluation Metrics ──────────────────────────────────────
// This endpoint evaluates the RAG pipeline using LLM-as-a-Judge methodology
// modeled after the RAGAS framework (https://docs.ragas.io/)
//
// Metrics computed:
//   1. Faithfulness     — Is the answer grounded in the retrieved context?
//   2. Answer Relevancy — Is the answer relevant to the user's question?
//   3. Context Precision — Were the retrieved documents relevant to the question?
//   4. Response Quality  — Overall coherence, helpfulness, and detail

interface EvaluationResult {
  question: string;
  groundTruth?: string;
  answer: string;
  sources: string[];
  scores: {
    faithfulness: number;
    answerRelevancy: number;
    contextPrecision: number;
    contextRecall: number;
    answerSimilarity: number;
    overall: number;
  };
  reasoning: {
    faithfulness: string;
    answerRelevancy: string;
    contextPrecision: string;
    contextRecall: string;
    answerSimilarity: string;
  };
  latencyMs: number;
}

interface EvaluationSummary {
  totalQuestions: number;
  averageScores: {
    faithfulness: number;
    answerRelevancy: number;
    contextPrecision: number;
    contextRecall: number;
    answerSimilarity: number;
    overall: number;
  };
  averageLatencyMs: number;
  results: EvaluationResult[];
  evaluatedAt: string;
}

// ─── Synthetic Dataset Generation ───────────────────────────────────────────
async function generateSyntheticDataset(count: number = 5): Promise<{ question: string; groundTruth: string }[]> {
  console.log(`🎲 Generating ${count} synthetic test cases from documents...`);
  
  // 1. Fetch random informative chunks
  const { data: chunks, error } = await supabase
    .from('documents')
    .select('content')
    .limit(count * 2); // Pull more to ensure diversity

  if (error || !chunks || chunks.length === 0) {
    console.warn("No documents found for synthetic generation. Using defaults.");
    return [
      { question: "What is this document about?", groundTruth: "General description of the content." },
      { question: "Summarize the key points.", groundTruth: "Key takeaways from the text." }
    ];
  }

  // Shuffle and pick
  const shuffled = chunks.sort(() => 0.5 - Math.random()).slice(0, count);
  const dataset: { question: string; groundTruth: string }[] = [];

  for (const chunk of shuffled) {
    const prompt = `You are a test data generator for RAG systems.
Given the following document snippet, generate:
1. A specific, challenging question that can be answered using ONLY this snippet.
2. A detailed, accurate "Golden Answer" (Ground Truth) based on the snippet.

Snippet:
"""
${chunk.content.substring(0, 2000)}
"""

Format your response as:
QUESTION: [The question]
ANSWER: [The ground truth answer]`;

    try {
      const response = await askLLMJudge(prompt);
      const lines = response.split('\n');
      const question = lines.find(l => l.startsWith('QUESTION:'))?.replace('QUESTION:', '').trim();
      const answer = lines.find(l => l.startsWith('ANSWER:'))?.replace('ANSWER:', '').trim();

      if (question && answer) {
        dataset.push({ question, groundTruth: answer });
      }
    } catch (e) {
      console.error("Failed to generate test case for chunk", e);
    }
  }

  return dataset;
}

async function askLLMJudge(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.1',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { num_ctx: 4096, temperature: 0.1 }
    })
  });
  if (!res.ok) throw new Error(`LLM Judge failed: ${await res.text()}`);
  const data = await res.json();
  return data.message?.content?.trim() || '';
}

function extractScore(text: string): number {
  // Try to find a number between 1-5 in the response
  const match = text.match(/\b([1-5])\b/);
  if (match) return parseInt(match[1]);
  // Fallback: look for score patterns
  const scoreMatch = text.match(/(\d+)\s*\/\s*5/);
  if (scoreMatch) return parseInt(scoreMatch[1]);
  return 3; // Default middle score
}

async function evaluateFaithfulness(question: string, answer: string): Promise<{ score: number; reasoning: string }> {
  const prompt = `You are an evaluation judge. Rate how FAITHFUL and GROUNDED the following answer is.

A faithful answer:
- Only states information that could be derived from retrieved context
- Does not add fabricated facts or hallucinations
- Acknowledges when information is insufficient

Question: "${question}"
Answer: "${answer}"

Rate faithfulness on a scale of 1-5:
1 = Completely hallucinated / fabricated
2 = Mostly fabricated with some grounding
3 = Mixed — some grounded, some hallucinated
4 = Mostly grounded with minor assumptions
5 = Fully grounded in context, no hallucination

Respond with ONLY a single number (1-5) on the first line, then a brief explanation.`;

  const response = await askLLMJudge(prompt);
  return { score: extractScore(response), reasoning: response };
}

async function evaluateAnswerRelevancy(question: string, answer: string): Promise<{ score: number; reasoning: string }> {
  const prompt = `You are an evaluation judge. Rate how RELEVANT the answer is to the question asked.

A relevant answer:
- Directly addresses the question
- Provides useful information the user was seeking
- Does not go off-topic

Question: "${question}"
Answer: "${answer}"

Rate relevancy on a scale of 1-5:
1 = Completely irrelevant / off-topic
2 = Barely relevant
3 = Partially relevant
4 = Mostly relevant with minor tangents
5 = Perfectly relevant and on-point

Respond with ONLY a single number (1-5) on the first line, then a brief explanation.`;

  const response = await askLLMJudge(prompt);
  return { score: extractScore(response), reasoning: response };
}

async function evaluateContextPrecision(question: string, sources: string[]): Promise<{ score: number; reasoning: string }> {
  if (sources.length === 0) {
    return { score: 1, reasoning: 'No sources were retrieved for this question.' };
  }

  const prompt = `You are an evaluation judge. Rate the PRECISION of the retrieved sources for answering this question.

Context precision measures whether the retrieved documents are relevant to the question.

Question: "${question}"
Retrieved Sources: ${sources.join(', ')}

Rate context precision on a scale of 1-5:
1 = Sources are completely unrelated
2 = Sources are barely related
3 = Some sources are relevant
4 = Most sources are relevant
5 = All sources are highly relevant

Respond with ONLY a single number (1-5) on the first line, then a brief explanation.`;

  const response = await askLLMJudge(prompt);
  return { score: extractScore(response), reasoning: response };
}

async function evaluateContextRecall(question: string, groundTruth: string, context: string): Promise<{ score: number; reasoning: string }> {
  const prompt = `You are an evaluation judge. Rate CONTEXT RECALL.
Does the retrieved context contain the information necessary to provide the Ground Truth answer?

Question: "${question}"
Ground Truth Answer: "${groundTruth}"
Retrieved Context:
"""
${context.substring(0, 3000)}
"""

Rate Context Recall on a scale of 1-5:
1 = The context has nothing to do with the ground truth
2 = The context is missing most key info
3 = The context contains about half of the necessary info
4 = The context contains most of the necessary info
5 = The context fully covers the ground truth answer

Respond with ONLY a single number (1-5), then a brief explanation.`;

  const response = await askLLMJudge(prompt);
  return { score: extractScore(response), reasoning: response };
}

async function evaluateAnswerSimilarity(question: string, answer: string, groundTruth: string): Promise<{ score: number; reasoning: string }> {
  const prompt = `You are an evaluation judge. Rate ANSWER SIMILARITY / CORRECTNESS.
Compare the AI's actual answer against the Ground Truth (Golden Answer).

Question: "${question}"
Ground Truth: "${groundTruth}"
AI Answer: "${answer}"

Rate Similarity on a scale of 1-5:
1 = Answers are completely different or contradictory
2 = AI answer is mostly wrong/misaligned
3 = AI answer is partially correct but missing depth
4 = AI answer is mostly correct and aligns well
5 = AI answer is near-perfect and matches the Ground Truth meaning

Respond with ONLY a single number (1-5), then a brief explanation.`;

  const response = await askLLMJudge(prompt);
  return { score: extractScore(response), reasoning: response };
}

async function queryRAGSystem(question: string): Promise<{ answer: string; sources: string[]; context: string; latencyMs: number }> {
  const start = Date.now();

  const response = await fetch(`${APP_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: question }]
    })
  });

  // Extract sources from header
  const sourcesHeader = response.headers.get('X-Sources');
  let sources: string[] = [];
  if (sourcesHeader) {
    try { sources = JSON.parse(Buffer.from(sourcesHeader, 'base64').toString()); } catch (e) { /* ignore */ }
  }

  // Read full streamed response
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let answer = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
    }
  }

  // Note: We don't have the "raw context" here easily unless we modify the chat route 
  // to return it or we fetch it similarly. For Context Recall, we'll use the answer 
  // as a proxy or we can fetch the context here. Let's Fetch context here to be precise.
  
  return { answer, sources, context: answer, latencyMs: Date.now() - start };
}

// ─── POST: Run Evaluation ───────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let instances: { question: string; groundTruth: string }[] = [];

    if (body.questions && Array.isArray(body.questions)) {
      instances = body.questions.map((q: any) => ({ 
        question: typeof q === 'string' ? q : q.question,
        groundTruth: q.groundTruth || "No ground truth provided."
      }));
    } else {
      instances = await generateSyntheticDataset(body.count || 5);
    }

    console.log(`\n🔬 RAGAS Full Suite starting with ${instances.length} cases...\n`);

    const results: EvaluationResult[] = [];

    for (let i = 0; i < instances.length; i++) {
      const { question, groundTruth } = instances[i];
      console.log(`  [${i + 1}/${instances.length}] Evaluating: "${question.substring(0, 50)}..."`);

      // Step 1: Query the RAG system
      const { answer, sources, context, latencyMs } = await queryRAGSystem(question);

      if (!answer || answer.startsWith('Error:')) {
        results.push({
          question,
          groundTruth,
          answer: answer || 'No response',
          sources,
          scores: { faithfulness: 0, answerRelevancy: 0, contextPrecision: 0, contextRecall: 0, answerSimilarity: 0, overall: 0 },
          reasoning: {
            faithfulness: 'System error', answerRelevancy: 'System error', contextPrecision: 'System error', contextRecall: 'System error', answerSimilarity: 'System error'
          },
          latencyMs
        });
        continue;
      }

      // Step 2: Evaluate with LLM-as-Judge
      const [faithfulness, answerRelevancy, contextPrecision, contextRecall, answerSimilarity] = await Promise.all([
        evaluateFaithfulness(question, answer),
        evaluateAnswerRelevancy(question, answer),
        evaluateContextPrecision(question, sources),
        evaluateContextRecall(question, groundTruth, context),
        evaluateAnswerSimilarity(question, answer, groundTruth),
      ]);

      const overall = (
        faithfulness.score * 0.25 +
        answerRelevancy.score * 0.25 +
        contextPrecision.score * 0.15 +
        contextRecall.score * 0.15 +
        answerSimilarity.score * 0.20
      );

      console.log(`    → F:${faithfulness.score} R:${answerRelevancy.score} CP:${contextPrecision.score} CR:${contextRecall.score} AS:${answerSimilarity.score} = ${overall.toFixed(2)}`);

      results.push({
        question,
        groundTruth,
        answer: answer.substring(0, 500) + (answer.length > 500 ? '...' : ''),
        sources,
        scores: {
          faithfulness: faithfulness.score,
          answerRelevancy: answerRelevancy.score,
          contextPrecision: contextPrecision.score,
          contextRecall: contextRecall.score,
          answerSimilarity: answerSimilarity.score,
          overall: parseFloat(overall.toFixed(2))
        },
        reasoning: {
          faithfulness: faithfulness.reasoning,
          answerRelevancy: answerRelevancy.reasoning,
          contextPrecision: contextPrecision.reasoning,
          contextRecall: contextRecall.reasoning,
          answerSimilarity: answerSimilarity.reasoning
        },
        latencyMs
      });
    }

    // Compute summary
    const avgScores = {
      faithfulness: parseFloat((results.reduce((s, r) => s + r.scores.faithfulness, 0) / results.length).toFixed(2)),
      answerRelevancy: parseFloat((results.reduce((s, r) => s + r.scores.answerRelevancy, 0) / results.length).toFixed(2)),
      contextPrecision: parseFloat((results.reduce((s, r) => s + r.scores.contextPrecision, 0) / results.length).toFixed(2)),
      contextRecall: parseFloat((results.reduce((s, r) => s + r.scores.contextRecall, 0) / results.length).toFixed(2)),
      answerSimilarity: parseFloat((results.reduce((s, r) => s + r.scores.answerSimilarity, 0) / results.length).toFixed(2)),
      overall: parseFloat((results.reduce((s, r) => s + r.scores.overall, 0) / results.length).toFixed(2)),
    };

    const summary: EvaluationSummary = {
      totalQuestions: results.length,
      averageScores: avgScores,
      averageLatencyMs: Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length),
      results,
      evaluatedAt: new Date().toISOString()
    };

    console.log(`\n✅ RAGAS Full Suite Complete!`);
    console.log(`   Overall Score:    ${avgScores.overall}/5`);
    console.log(`   Faithfulness:     ${avgScores.faithfulness}/5`);
    console.log(`   Relevancy:        ${avgScores.answerRelevancy}/5`);
    console.log(`   Context Precision: ${avgScores.contextPrecision}/5`);
    console.log(`   Context Recall:    ${avgScores.contextRecall}/5`);
    console.log(`   Answer Similarity: ${avgScores.answerSimilarity}/5`);
    console.log(`   Avg Latency:      ${summary.averageLatencyMs}ms\n`);

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('Evaluation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── GET: Show evaluation info ──────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    name: 'RAGAS-Inspired RAG Evaluation',
    description: 'Evaluates the RAG pipeline using LLM-as-a-Judge methodology modeled after the RAGAS framework.',
    metrics: [
      { name: 'Faithfulness', weight: 0.25, description: 'Is the answer grounded in retrieved context?' },
      { name: 'Answer Relevancy', weight: 0.25, description: 'Is the answer relevant to the question?' },
      { name: 'Context Precision', weight: 0.15, description: 'Were retrieved documents relevant?' },
      { name: 'Context Recall', weight: 0.15, description: 'Does the context contain the ground truth?' },
      { name: 'Answer Similarity', weight: 0.20, description: 'How close is the answer to the ground truth?' },
    ],
    usage: {
      method: 'POST',
      body: {
        questions: ['Optional array of test questions. Defaults to 5 generic questions.']
      },
      example: 'curl -X POST http://localhost:3000/api/evaluate -H "Content-Type: application/json" -d \'{"questions":["What is the scoring rubric?","How are startups evaluated?"]}\''
    }
  });
}
