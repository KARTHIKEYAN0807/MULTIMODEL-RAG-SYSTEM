-- 1. Create a temporary table to hold data
CREATE TEMP TABLE temp_documents AS SELECT * FROM documents;

-- 2. Drop the old table and any dependent indexes
DROP TABLE documents CASCADE;

-- 3. Re-create the table with 1536 dimensions for OpenAI Embeddings (text-embedding-3-small)
CREATE TABLE documents (
  id uuid primary key default gen_random_uuid(),
  content text,
  metadata jsonb,
  embedding vector(1536),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Enable full-text search index (BM25 style)
CREATE INDEX documents_content_fts_idx ON documents USING GIN (to_tsvector('english', content));

-- 5. Create HNSW vector index for extremely fast retrieval
CREATE INDEX documents_embedding_hnsw_idx ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 6. Re-create the Hybrid Search RPC function
CREATE OR REPLACE FUNCTION hybrid_search (
  query_text TEXT,
  query_embedding VECTOR(1536),
  match_count INT,
  vector_weight FLOAT DEFAULT 0.7,
  text_weight FLOAT DEFAULT 0.3,
  match_threshold FLOAT DEFAULT 0.05
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    (
      vector_weight * (1 - (d.embedding <=> query_embedding)) +
      text_weight * (ts_rank_cd(to_tsvector('english', d.content), to_tsquery('english', query_text)))
    ) AS similarity
  FROM documents d
  WHERE (1 - (d.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
