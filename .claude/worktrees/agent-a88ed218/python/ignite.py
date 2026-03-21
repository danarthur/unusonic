"""
DanielOS Brain - Connection Test Script (FIXED)
Proves the "Brain" works by testing Supabase and OpenAI integration.
"""

import os
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from supabase import create_client, Client
from openai import OpenAI

# 1. Load Secrets from .env file
load_dotenv()

# Get environment variables
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
openai_key = os.getenv("OPENAI_API_KEY")

# Validate that all required environment variables are set
if not url:
    raise ValueError("SUPABASE_URL must be set in .env file")
if not key:
    raise ValueError("SUPABASE_KEY must be set in .env file")
if not openai_key:
    raise ValueError("OPENAI_API_KEY must be set in .env file")

# 2. Initialize Clients
supabase: Client = create_client(url, key)
client = OpenAI(api_key=openai_key)

def get_embedding(text: str):
    """Generates a 1536-dim vector using OpenAI"""
    response = client.embeddings.create(
        model="text-embedding-3-small", 
        input=text
    )
    return response.data[0].embedding

def get_workspace_id(name: str = "DanielOS Home") -> str:
    """Finds or creates the default workspace"""
    # Try to find it
    response = supabase.table("workspaces").select("id").eq("name", name).execute()
    
    if response.data:
        return response.data[0]['id']
    
    # Create it if missing
    print(f"🔨 Creating Workspace: {name}...")
    response = supabase.table("workspaces").insert({"name": name}).execute()
    return response.data[0]['id']

def create_memory(workspace_id: str, content: str, sentiment_data: Dict[str, Any]):
    """Stores a thought with Emotional Context"""
    print(f"🧠 Thinking about: '{content[:30]}...'")
    
    # 1. Generate Vector
    vector = get_embedding(content)
    
    # 2. Insert into Spine
    # FIX: Use 'body', remove 'fts_vector', add 'workspace_id'
    data = {
        "workspace_id": workspace_id,
        "title": "Ignition Test Memory",
        "body": content, 
        "embedding": vector,
        "affective_context": sentiment_data,
        "source": "manual",
        "type": "note"
    }
    
    response = supabase.table("spine_items").insert(data).execute()
    print(f"✅ Memory Stored! ID: {response.data[0]['id']}")

def recall_memory(workspace_id: str, query: str):
    """Tests the Hybrid Search (Vector + Keyword)"""
    print(f"\n🔍 Searching for: '{query}'...")
    
    # 1. Generate Query Vector
    query_vector = get_embedding(query)
    
    # 2. Call the RPC function
    # FIX: Must match the SQL function signature exactly
    params = {
        "query_text": query,
        "query_embedding": query_vector,
        "match_threshold": 0.5,
        "match_count": 5,
        "filter_workspace_id": workspace_id
    }
    
    response = supabase.rpc("search_spine", params).execute()
    
    for item in response.data:
        print(f"💡 Found: {item['title']} (Similarity: {item['similarity']:.2f})")

# ==========================================
# EXECUTION
# ==========================================
if __name__ == "__main__":
    print("=" * 60)
    print("🚀 IGNITION SEQUENCE STARTED")
    print("=" * 60)

    # 1. Get Workspace
    ws_id = get_workspace_id()
    print(f"🏠 Operating in Workspace ID: {ws_id}")

    # 2. Create "Work Mode" memory (High Efficiency)
    create_memory(
        ws_id,
        "Complete the Q3 financial audit by Friday. Priority P1.", 
        {"valence": 0.1, "arousal": 0.8, "mode": "work"}
    )

    # 3. Create "Life Mode" memory (High Emotion)
    create_memory(
        ws_id,
        "I'm feeling really overwhelmed by the amount of coding I have to learn.",
        {"valence": -0.8, "arousal": 0.6, "mode": "personal", "label": "anxiety"}
    )
    
    # 4. Search to prove retrieval works
    recall_memory(ws_id, "audit")
    
    print("\n✅ System is ONLINE. The brain is accepting data.")