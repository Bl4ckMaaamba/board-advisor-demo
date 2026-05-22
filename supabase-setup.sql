-- 1. Enable pgvector extension
create extension if not exists vector with schema extensions;

-- 2. Documents table
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  size integer not null,
  board text not null,
  meeting_id text,
  uploaded_by text not null default 'Utilisateur',
  status text not null default 'pending',  -- pending | indexed | error
  created_at timestamptz default now()
);

-- 3. Document chunks with embeddings (Voyage 4, 1024 dimensions)
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content text not null,
  section_title text,
  chunk_index integer not null,
  embedding vector(1024),
  created_at timestamptz default now()
);

-- 4. Index for fast vector search (HNSW works on empty tables, unlike IVFFlat)
-- If you had the old index, drop it first:
-- DROP INDEX IF EXISTS document_chunks_embedding_idx;
create index if not exists document_chunks_embedding_idx
  on document_chunks
  using hnsw (embedding vector_cosine_ops);

-- 5. Vector search function (Voyage 4 — 1024 dims, threshold 0.5)
create or replace function match_documents(
  query_embedding vector(1024),
  match_count int default 10,
  match_threshold float default 0.5,
  filter_board text default null
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  content text,
  section_title text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    d.name as document_name,
    dc.content,
    dc.section_title,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where 1 - (dc.embedding <=> query_embedding) > match_threshold
    and d.status = 'indexed'
    and (filter_board is null or d.board = filter_board)
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 6. RLS policies
alter table documents enable row level security;
alter table document_chunks enable row level security;

create policy "Allow all on documents" on documents for all using (true) with check (true);
create policy "Allow all on document_chunks" on document_chunks for all using (true) with check (true);
