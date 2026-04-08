-- ============================================
-- Migration: Add Hybrid Search (Vector + BM25)
-- ============================================

-- 1. Add full-text search column
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS fts tsvector;

-- 2. Populate existing rows
UPDATE public.documents SET fts = to_tsvector('english', content) WHERE fts IS NULL;

-- 3. Create GIN index for fast full-text lookups
CREATE INDEX IF NOT EXISTS documents_fts_idx ON public.documents USING gin (fts);

-- 4. Auto-populate fts on INSERT or UPDATE
CREATE OR REPLACE FUNCTION documents_fts_trigger() RETURNS trigger AS $$
BEGIN
  NEW.fts := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_fts_update ON public.documents;
CREATE TRIGGER documents_fts_update
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION documents_fts_trigger();

-- 5. Hybrid search function: combines vector similarity + full-text keyword matching
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text text,
  query_embedding vector(768),
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
  FROM documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count)

  UNION ALL

  -- Full-text (BM25-style) results
  (SELECT
    d.id,
    d.content,
    d.metadata,
    ts_rank_cd(d.fts, websearch_to_tsquery('english', query_text)) * text_weight AS similarity,
    'keyword'::text AS search_type
  FROM documents d
  WHERE d.fts @@ websearch_to_tsquery('english', query_text)
  ORDER BY ts_rank_cd(d.fts, websearch_to_tsquery('english', query_text)) DESC
  LIMIT match_count)
$$;
