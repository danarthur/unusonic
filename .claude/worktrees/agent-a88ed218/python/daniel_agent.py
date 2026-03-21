"""
DanielOS Agent - Core Agent Logic
The thinking engine that processes user input, retrieves context, and generates responses.
"""

import os
import json
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv
from supabase import create_client, Client
from openai import OpenAI

# Load environment variables
load_dotenv()

# Initialize clients
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
openai_api_key = os.getenv("OPENAI_API_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env file")

if not openai_api_key:
    raise ValueError("OPENAI_API_KEY must be set in .env file")

supabase: Client = create_client(supabase_url, supabase_key)
openai_client = OpenAI(api_key=openai_api_key)


class DanielAgent:
    """
    Core agent that processes user messages, retrieves context, and generates responses.
    """
    
    def __init__(self, workspace_id: Optional[str] = None):
        """
        Initialize the agent.
        
        Args:
            workspace_id: Optional workspace ID. If not provided, will use "DanielOS Home"
        """
        self.workspace_id = workspace_id
        self.default_persona = None
        self.manager_persona = None
        self.friend_persona = None
        
        # Load default persona on startup
        self._load_default_persona()
        
        # Get or create workspace if not provided
        if not self.workspace_id:
            self.workspace_id = self._get_workspace_id("DanielOS Home")
    
    def _get_workspace_id(self, name: str = "DanielOS Home") -> str:
        """Finds or creates the default workspace"""
        response = supabase.table("workspaces").select("id").eq("name", name).execute()
        
        if response.data:
            return response.data[0]['id']
        
        # Create it if missing
        print(f"🔨 Creating Workspace: {name}...")
        response = supabase.table("workspaces").insert({"name": name}).execute()
        return response.data[0]['id']
    
    def _load_default_persona(self):
        """Load the Default Persona from the personas table on startup"""
        try:
            response = supabase.table("personas").select("*").eq("name", "Default Persona").execute()
            
            if response.data and len(response.data) > 0:
                self.default_persona = response.data[0].get("prompt", "")
                print("✓ Loaded Default Persona")
            else:
                # Fallback to a basic default prompt
                self.default_persona = "You are Arthur, the central intelligence of DanielOS. You are helpful, precise, and adaptive."
                print("⚠ Default Persona not found in DB, using fallback")
        except Exception as e:
            print(f"⚠ Default Persona not found in DB, using fallback: {e}")
            # CHANGE THIS LINE BELOW:
            self.default_persona = "You are Arthur, the AI operating system for DanielOS. You are helpful, precise, and efficient."
    
    def _get_persona(self, mode: str) -> str:
        """
        Fetches prompt from DB based on mode.
        
        Args:
            mode: "work" or "personal"
        
        Returns:
            Persona prompt string
        """
        try:
            persona_name = "Manager" if mode == "work" else "Friend"
            response = supabase.table("personas").select("*").eq("name", persona_name).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0].get("prompt", self.default_persona)
            else:
                print(f"⚠ {persona_name} persona not found, using default")
                return self.default_persona
        except Exception as e:
            print(f"⚠ Error loading {mode} persona: {e}")
            return self.default_persona
    
    def _get_embedding(self, text: str) -> List[float]:
        """Generate a 1536-dim vector using OpenAI"""
        response = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    
    def _save_memory(
        self,
        content: str,
        affective_context: Dict[str, Any],
        memory_type: str = "journal"
    ) -> Optional[str]:
        """
        Writes to spine_items.
        
        Args:
            content: The text content to store
            affective_context: Sentiment/emotion data
            memory_type: Type of memory (e.g., "journal", "note")
        
        Returns:
            The inserted memory ID or None
        """
        try:
            # Generate embedding
            embedding = self._get_embedding(content)
            
            # Insert into spine_items
            data = {
                "workspace_id": self.workspace_id,
                "title": f"Journal Entry: {content[:50]}...",
                "body": content,
                "embedding": embedding,
                "affective_context": affective_context,
                "source": "agent",
                "type": memory_type
            }
            
            response = supabase.table("spine_items").insert(data).execute()
            
            if response.data:
                return response.data[0]['id']
            return None
        except Exception as e:
            print(f"✗ Error saving memory: {e}")
            return None
    
    def _log_run(
        self,
        user_message: str,
        agent_response: str,
        persona_used: str,
        tokens_used: Optional[int] = None
    ):
        """
        Writes to agent_runs.
        
        Args:
            user_message: The user's input
            agent_response: The agent's response
            persona_used: Which persona was used
            tokens_used: Optional token count
        """
        try:
            data = {
                "workspace_id": self.workspace_id,
                "user_message": user_message,
                "agent_response": agent_response,
                "persona_used": persona_used,
                "tokens_used": tokens_used
            }
            
            supabase.table("agent_runs").insert(data).execute()
        except Exception as e:
            print(f"⚠ Error logging run: {e}")
    
    def think(self, user_message: str) -> str:
        """
        The Core Loop - Process user message and generate response.
        
        Args:
            user_message: The user's input message
        
        Returns:
            The agent's response
        """
        print(f"\n{'='*60}")
        print(f"🧠 Processing: '{user_message[:50]}...'")
        print(f"{'='*60}\n")
        
        # Step A: Perception - Generate embedding for user's message
        print("Step A: Generating embedding...")
        user_embedding = self._get_embedding(user_message)
        print("✓ Embedding generated\n")
        
        # Step B: Routing - Analyze sentiment and intent
        print("Step B: Analyzing sentiment and intent...")
        routing_prompt = f"""Analyze this message and return JSON with sentiment and intent:
"{user_message}"

Return JSON only with this structure:
{{
    "valence": <float between -1.0 and 1.0>,
    "mode": "work" or "personal",
    "intent": "<brief description of what the user wants>"
}}"""
        
        routing_response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a sentiment analyzer. Return only valid JSON."},
                {"role": "user", "content": routing_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        routing_data = json.loads(routing_response.choices[0].message.content)
        valence = routing_data.get("valence", 0.0)
        mode = routing_data.get("mode", "personal")
        intent = routing_data.get("intent", "general inquiry")
        
        print(f"✓ Valence: {valence}, Mode: {mode}, Intent: {intent}\n")
        
        # Step C: Persona Switch
        print(f"Step C: Loading {mode} persona...")
        persona_prompt = self._get_persona(mode)
        persona_name = "Manager" if mode == "work" else "Friend"
        print(f"✓ Using {persona_name} persona\n")
        
        # Step D: Retrieval - Get relevant context
        print("Step D: Retrieving relevant context...")
        query_vector = self._get_embedding(user_message)
        
        try:
            search_params = {
                "query_text": user_message,
                "query_embedding": query_vector,
                "match_threshold": 0.3,  # Default threshold to ensure we get results
                "match_count": 5,
                "filter_workspace_id": self.workspace_id
            }
            
            search_response = supabase.rpc("search_spine", search_params).execute()
            
            context_items = search_response.data if search_response.data else []
            print(f"✓ Retrieved {len(context_items)} relevant memories\n")
            
            # Format context for prompt
            context_text = ""
            if context_items:
                context_text = "\n\nRelevant Context:\n"
                for i, item in enumerate(context_items, 1):
                    body = item.get("body", item.get("content", ""))
                    title = item.get("title", "Memory")
                    similarity = item.get("similarity", 0.0)
                    context_text += f"{i}. {title}: {body[:100]}... (similarity: {similarity:.2f})\n"
        except Exception as e:
            print(f"⚠ Error retrieving context: {e}")
            context_items = []
            context_text = ""
        
        # Step E: Generation - Send to GPT-4o
        print("Step E: Generating response...")
        system_prompt = f"""{persona_prompt}

You have access to relevant context from Daniel's memory. Use it to provide informed, contextual responses.
Be concise but helpful. Match the emotional tone when appropriate."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"{context_text}\n\nUser Message: {user_message}"}
        ]
        
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.7
        )
        
        agent_response = response.choices[0].message.content
        tokens_used = response.usage.total_tokens if response.usage else None
        
        print(f"✓ Response generated ({tokens_used} tokens)\n")
        
        # Step F: Memory - Save user input and log run
        print("Step F: Saving memory and logging run...")
        affective_context = {
            "valence": valence,
            "mode": mode,
            "intent": intent
        }
        
        memory_id = self._save_memory(
            content=user_message,
            affective_context=affective_context,
            memory_type="journal"
        )
        
        if memory_id:
            print(f"✓ Memory saved (ID: {memory_id})")
        
        self._log_run(
            user_message=user_message,
            agent_response=agent_response,
            persona_used=persona_name,
            tokens_used=tokens_used
        )
        print("✓ Run logged\n")
        
        return agent_response


# Example usage
if __name__ == "__main__":
    print("=" * 60)
    print("DanielOS Agent - Initialization")
    print("=" * 60)
    
    # Initialize agent
    agent = DanielAgent()
    
    # Test with a sample message
    test_message = "I'm feeling stressed about the upcoming deadline"
    response = agent.think(test_message)
    
    print("\n" + "=" * 60)
    print("Agent Response:")
    print("=" * 60)
    print(response)
    print("=" * 60)

