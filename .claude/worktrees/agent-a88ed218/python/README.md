# DanielOS Brain - Python Client

Python client for the DanielOS agentic system, connecting Supabase and OpenAI.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

3. Update `.env` with your actual keys:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase service role key (for server-side operations)
- `OPENAI_API_KEY`: Your OpenAI API key

## Usage

Run the connection test:
```bash
python ignite.py
```

This will:
1. Check/create a "DanielOS Home" workspace
2. Insert a test memory with affective context
3. Search for memories to verify retrieval works

## Database Schema

The script expects a `spine_items` table with:
- `embedding` (vector 1536)
- `affective_context` (JSONB)
- `fts_vector` (text for full-text search)
- `content` or `text` (text content)

And a `search_spine` RPC function for hybrid search.

