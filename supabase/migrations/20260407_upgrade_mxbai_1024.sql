-- ============================================
-- Migration: Hard Reset for 1024-Dimension Vectors (mxbai-embed-large)
-- ============================================

-- 1. Obliterate old data/schema
DROP TABLE IF EXISTS public.documents CASCADE;
DROP FUNCTION IF EXISTS hybrid_search(text, vector(768), int, float, float, float) CASCADE;
DROP FUNCTION IF EXISTS documents_fts_trigger CASCADE;

-- 2. Create the NEW documents table (1024 dimensions)
CREATE TABLE public.documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content text NOT NULL,
  embedding vector(1024) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  fts tsvector
);

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON public.documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS documents_fts_idx ON public.documents USING gin (fts);

-- 4. Re-apply Full-Text Search Auto-Trigger
CREATE OR REPLACE FUNCTION documents_fts_trigger() RETURNS trigger AS $$
BEGIN
  NEW.fts := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_fts_update
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION documents_fts_trigger();

-- 5. Recreate Hybrid Search (now targeting 1024 dims)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 10,
  vector_weight float DEFAULT 0.7,
  text_weight float DEFAULT 0.3,
  match_threshold float DEFAULT 0.1
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  search_type text
)
LANGUAGE sql STABLE
AS $$
  -- Vector results
  (SELECT
    d.id,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> query_embedding)) * vector_weight AS similarity,
    'vector'::text AS search_type
  FROM public.documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count)

  UNION ALL

  -- Full-text (BM25-style) results
  (SELECT
    d.id,
    d.content,
    d.metadata,
    ts_rank_cd(d.fts, plainto_tsquery('english', query_text)) * text_weight AS similarity,
    'keyword'::text AS search_type
  FROM public.documents d
  WHERE d.fts @@ plainto_tsquery('english', query_text)
  ORDER BY ts_rank_cd(d.fts, plainto_tsquery('english', query_text)) DESC
  LIMIT match_count)
$$;
