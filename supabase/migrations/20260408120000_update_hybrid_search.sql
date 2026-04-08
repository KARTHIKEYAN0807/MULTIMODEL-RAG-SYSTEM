-- Update hybrid search to use websearch_to_tsquery for better phrase and OR matching

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

  -- Full-text (BM25-style) results using websearch_to_tsquery
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
