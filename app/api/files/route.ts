import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// GET — List all unique uploaded files with chunk counts (folder-aware)
export async function GET(req: Request) {
  try {
    // API Key Security
    const authHeader = req.headers.get('Authorization');
    const expectedKey = process.env.RAG_API_KEY;
    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('documents')
      .select('id, metadata, content');

    if (error) throw error;

    // Group by source filename
    const fileMap = new Map<string, {
      source: string;
      type: string;
      folder: string | null;
      chunkCount: number;
      ids: string[];
      imageUrls: string[];
    }>();

    for (const doc of data || []) {
      const source = doc.metadata?.source || 'Unknown';
      const type = doc.metadata?.type || 'text';
      const folder = doc.metadata?.folder || null;
      const existing = fileMap.get(source);

      if (existing) {
        existing.chunkCount++;
        existing.ids.push(doc.id);
        if (doc.metadata?.imageUrl) existing.imageUrls.push(doc.metadata.imageUrl);
      } else {
        fileMap.set(source, {
          source,
          type,
          folder,
          chunkCount: 1,
          ids: [doc.id],
          imageUrls: doc.metadata?.imageUrl ? [doc.metadata.imageUrl] : []
        });
      }
    }

    const files = Array.from(fileMap.values()).map(f => ({
      source: f.source,
      type: f.type,
      folder: f.folder,
      chunkCount: f.chunkCount,
      imageCount: f.imageUrls.length,
    }));

    return NextResponse.json({ files });
  } catch (error: any) {
    console.error('Files list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — Remove by source filename OR by folder name
export async function DELETE(req: Request) {
  try {
    // API Key Security
    const authHeader = req.headers.get('Authorization');
    const expectedKey = process.env.RAG_API_KEY;
    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { source, folder } = body;

    if (!source && !folder) {
      return NextResponse.json({ error: 'Source filename or folder name is required' }, { status: 400 });
    }

    let docs: any[] = [];

    if (folder) {
      // Delete ALL documents belonging to this folder
      const { data, error } = await supabase
        .from('documents')
        .select('id, metadata')
        .filter('metadata->>folder', 'eq', folder);

      if (error) throw error;
      docs = data || [];
    } else {
      // Delete by individual source (original behavior)
      const { data, error } = await supabase
        .from('documents')
        .select('id, metadata')
        .filter('metadata->>source', 'eq', source);

      if (error) throw error;
      docs = data || [];
    }

    if (docs.length === 0) {
      return NextResponse.json({ error: 'No documents found' }, { status: 404 });
    }

    // Collect image storage paths to clean up
    const imageUrls: string[] = [];
    for (const doc of docs) {
      if (doc.metadata?.imageUrl) {
        const url = doc.metadata.imageUrl as string;
        const parts = url.split('/');
        const fileName = parts[parts.length - 1];
        if (fileName) imageUrls.push(fileName);
      }
    }

    // Delete all documents
    const docIds = docs.map(d => d.id);
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .in('id', docIds);

    if (deleteError) throw deleteError;

    // Clean up images from storage (non-blocking)
    if (imageUrls.length > 0) {
      try {
        await supabase.storage.from('images').remove(imageUrls);
      } catch (e) {
        console.warn('Image cleanup failed (non-critical):', e);
      }
    }

    return NextResponse.json({
      success: true,
      deletedChunks: docIds.length,
      deletedImages: imageUrls.length,
      deletedTarget: folder ? `folder: ${folder}` : `file: ${source}`
    });
  } catch (error: any) {
    console.error('File delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
