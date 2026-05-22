-- Migration 016: match_documents accessible to all board members, not just uploader.
--
-- Bug: the previous RPC filtered chunks by `d.user_id = filter_user_id`, which
-- silently hid documents uploaded by other members of the same board. Effect:
-- when user B asked the agent about a PDF uploaded by user A in their shared
-- board, RAG returned 0 results — even though the doc picker showed it.
--
-- Fix: keep the uploader filter only for personal docs (no board). For board
-- docs, allow any member of that board through.


