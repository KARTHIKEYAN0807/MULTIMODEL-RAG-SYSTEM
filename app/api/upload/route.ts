import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// @ts-expect-error - pdf-parse v1 has no ESM default export declaration
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

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

async function describeImageWithLlava(base64Image: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'moondream',
      prompt: 'Analyze this image in detail. Describe everything you see including any text, diagrams, charts, photos, or visual elements. Be thorough.',
      images: [base64Image],
      stream: false
    })
  });
  if (!res.ok) throw new Error(`LLaVA failed: ${await res.text()}`);
  const data = await res.json();
  return data.response || '';
}

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

async function chunkAndInsertText(text: string, fileName: string, folder?: string | null): Promise<{ indexed: number; textChunks: number }> {
  let indexed = 0;
  let textChunks = 0;

  // Semantic chunking with overlap
  const rawChunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > CHUNK_SIZE && currentChunk.length > 0) {
      rawChunks.push(currentChunk.trim());
      currentChunk = '';
    }

    if (paragraph.length > CHUNK_SIZE) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > CHUNK_SIZE && currentChunk.length > 0) {
          rawChunks.push(currentChunk.trim());
          currentChunk = '';
        }
        currentChunk += sentence + ' ';
      }
    } else {
      currentChunk += paragraph + '\n\n';
    }
  }
  if (currentChunk.trim()) {
    rawChunks.push(currentChunk.trim());
  }

  // Apply sliding window overlap between adjacent chunks
  const chunks: string[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    let chunk = rawChunks[i];
    // Prepend tail of previous chunk as overlap context
    if (i > 0) {
      const prevTail = rawChunks[i - 1].slice(-CHUNK_OVERLAP);
      chunk = prevTail + '\n' + chunk;
    }
    chunks.push(chunk);
  }

  console.log(`[${fileName}] Semantic chunking: ${rawChunks.length} base chunks with ${CHUNK_OVERLAP}-char overlap`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;

    const enrichedChunk = `[Source: ${fileName}${folder ? ` | Folder: ${folder}` : ''}]\n\n${chunk}`;
    const embedding = await getOllamaEmbedding(enrichedChunk);
    const { error } = await supabase.from('documents').insert({
      content: enrichedChunk,
      embedding,
      metadata: { source: fileName, type: 'text', chunkIndex: i, ...(folder ? { folder } : {}) }
    });
    if (error) {
      console.error(`Supabase insert text error for ${fileName}:`, error);
    } else {
      indexed++;
      textChunks++;
    }
  }

  return { indexed, textChunks };
}

export async function POST(req: Request) {
  try {
    // 1. Simple API Key Security
    const authHeader = req.headers.get('Authorization');
    const expectedKey = process.env.RAG_API_KEY;

    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized: Invalid API Key" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const url = formData.get('url') as string | null;
    const folder = formData.get('folder') as string | null;

    if (!file && !url) {
      return NextResponse.json({ error: 'No file or URL provided' }, { status: 400 });
    }

    let indexedCount = 0;
    let imageCount = 0;
    let textChunkCount = 0;

    // ──────────────────────────────────────
    // ROUTE 0: URL Ingestion
    // ──────────────────────────────────────
    if (url) {
      console.log(`[URL] Fetching content from: ${url}`);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
        }

        const html = await response.text();

        // Use cheerio to extract clean text from HTML
        const $ = cheerio.load(html);

        // Remove scripts, styles, and other non-reading elements
        $('script, style, noscript, nav, footer, header, aside, .ad, .advertisement').remove();

        // Extract remaining text
        let text = $('body').text();

        // Clean up excessive whitespace
        text = text.replace(/\s+/g, ' ').trim();

        if (!text) {
          return NextResponse.json({ error: 'Could not extract readable text from the URL.' }, { status: 400 });
        }

        const { indexed, textChunks } = await chunkAndInsertText(text, url, folder);

        return NextResponse.json({
          success: true,
          chunksCount: indexed,
          summary: `Scraped website and processed ${textChunks} text chunks.`
        });

      } catch (err: any) {
        console.error("URL Ingestion Error:", err);
        return NextResponse.json({ error: `URL Scraping failed: ${err.message}` }, { status: 500 });
      }
    }

    // ──────────────────────────────────────
    // FILE PROCESSING ROUTES
    // ──────────────────────────────────────
    if (!file) throw new Error("No file provided");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name.toLowerCase();
    const mimeType = file.type;

    // ──────────────────────────────────────
    // ROUTE 1: Image files (PNG, JPG, WEBP)
    // ──────────────────────────────────────
    if (mimeType.startsWith('image/')) {
      const base64Image = buffer.toString('base64');

      // Upload original image to Supabase Storage
      const storageName = `${Date.now()}-${file.name}`;
      const { error: storageError } = await supabase
        .storage.from('images')
        .upload(storageName, buffer, { contentType: mimeType });

      if (storageError) {
        console.error("Supabase storage error:", storageError);
      }

      const imageUrl = `${supabaseUrl}/storage/v1/object/public/images/${storageName}`;

      // Send to LLaVA for vision analysis
      console.log(`Sending image "${file.name}" to LLaVA for analysis...`);
      const description = await describeImageWithLlava(base64Image);

      if (description) {
        const enrichedDescription = `[Image File: ${file.name}${folder ? ` | Folder: ${folder}` : ''}]\n\n${description}`;
        const embedding = await getOllamaEmbedding(enrichedDescription);
        const { error: dbError } = await supabase.from('documents').insert({
          content: enrichedDescription,
          embedding,
          metadata: { source: file.name, type: 'image', imageUrl, ...(folder ? { folder } : {}) }
        });
        if (dbError) {
          console.error("Supabase insert error:", dbError);
        } else {
          indexedCount++;
          imageCount++;
        }
      }

      return NextResponse.json({
        success: true,
        chunksCount: indexedCount,
        summary: `Processed 1 image via LLaVA vision.`
      });
    }

    // ──────────────────────────────────────
    // ROUTE 2: PDF files
    // ──────────────────────────────────────
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      // --- Extract Text ---
      const pdfData = await pdfParse(buffer);
      const { indexed, textChunks } = await chunkAndInsertText(pdfData.text, file.name, folder);
      indexedCount += indexed;
      textChunkCount += textChunks;

      // --- Extract Embedded JPEG Images ---
      try {
        const imageBuffers = extractImagesFromPdfBuffer(buffer);
        console.log(`Found ${imageBuffers.length} embedded images in PDF`);

        for (let i = 0; i < imageBuffers.length; i++) {
          const base64Image = imageBuffers[i].toString('base64');

          // Upload to Supabase Storage
          const storageName = `${Date.now()}-pdf-img-${i}.jpg`;
          const { error: storageError } = await supabase
            .storage.from('images')
            .upload(storageName, imageBuffers[i], { contentType: 'image/jpeg' });

          if (storageError) {
            console.error("Supabase storage error:", storageError);
          }

          const imageUrl = `${supabaseUrl}/storage/v1/object/public/images/${storageName}`;

          // Send to LLaVA
          console.log(`Sending PDF image ${i + 1}/${imageBuffers.length} to LLaVA...`);
          const description = await describeImageWithLlava(base64Image);

          if (description) {
            const enrichedDescription = `[Image from PDF: ${file.name}${folder ? ` | Folder: ${folder}` : ''}]\n\n${description}`;
            const embedding = await getOllamaEmbedding(enrichedDescription);
            const { error: dbError } = await supabase.from('documents').insert({
              content: enrichedDescription,
              embedding,
              metadata: { source: file.name, type: 'image', imageUrl, pageIndex: i, ...(folder ? { folder } : {}) }
            });
            if (dbError) {
              console.error("Supabase insert image error:", dbError);
            } else {
              indexedCount++;
              imageCount++;
            }
          }
        }
      } catch (imgError: any) {
        console.warn("Image extraction skipped:", imgError.message);
      }

      return NextResponse.json({
        success: true,
        chunksCount: indexedCount,
        summary: `Processed ${textChunkCount} text chunks and ${imageCount} images.`
      });
    }

    // ──────────────────────────────────────
    // ROUTE 3: Word Documents (.docx)
    // ──────────────────────────────────────
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      console.log(`Extracting text from DOCX: ${file.name}`);
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value;

      const { indexed, textChunks } = await chunkAndInsertText(text, file.name, folder);
      indexedCount += indexed;
      textChunkCount += textChunks;

      return NextResponse.json({
        success: true,
        chunksCount: indexedCount,
        summary: `Processed ${textChunkCount} DOCX text chunks.`
      });
    }

    // ──────────────────────────────────────
    // ROUTE 4: Plain Text files (.txt, .md, .csv)
    // ──────────────────────────────────────
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.csv')
    ) {
      console.log(`Extracting text from Plain Text file: ${file.name}`);
      const text = buffer.toString('utf-8');

      const { indexed, textChunks } = await chunkAndInsertText(text, file.name, folder);
      indexedCount += indexed;
      textChunkCount += textChunks;

      return NextResponse.json({
        success: true,
        chunksCount: indexedCount,
        summary: `Processed ${textChunkCount} text chunks.`
      });
    }

    // ──────────────────────────────────────
    // ROUTE 5: Unsupported file type
    // ──────────────────────────────────────
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}. Upload PDFs, Word Docs (.docx), plain text (.txt, .md) or images.` },
      { status: 400 }
    );

  } catch (error: any) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Extract JPEG images directly from the raw PDF binary buffer.
 * PDFs embed JPEG images between FFD8 (start) and FFD9 (end) markers.
 * Pure JS — zero native dependencies.
 */
function extractImagesFromPdfBuffer(buffer: Buffer): Buffer[] {
  const images: Buffer[] = [];
  let offset = 0;

  while (offset < buffer.length - 1) {
    if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xD8) {
      const start = offset;
      offset += 2;
      while (offset < buffer.length - 1) {
        if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xD9) {
          const end = offset + 2;
          const imgBuf = buffer.subarray(start, end);
          if (imgBuf.length > 5000) {
            images.push(Buffer.from(imgBuf));
          }
          offset = end;
          break;
        }
        offset++;
      }
    } else {
      offset++;
    }
  }

  return images;
}
