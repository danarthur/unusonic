import os
import time
from daniel_agent import DanielAgent

def main():
    print("\n" + "="*50)
    print("🤖 A.R.T.H.U.R. ONLINE | SYSTEM READY")
    print("="*50)
    print("Initializing Brain...\n")
    
    try:
        # Boot up the agent
        agent = DanielAgent()
        print("✅ System Ready. Type 'exit' to quit.\n")
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        return

    while True:
        try:
            user_input = input("\n👤 You: ")
            if user_input.lower() in ["exit", "quit", "q"]:
                print("\n👋 Severing Link. Goodbye.")
                break
            
            if not user_input.strip():
                continue

            print("Thinking...", end="", flush=True)
            start_time = time.time()
            
            # The Magic Happens Here
            response = agent.think(user_input)
            
            duration = time.time() - start_time
            print(f"\r🤖 Arthur ({duration:.1f}s): {response}\n")
            
        except KeyboardInterrupt:
            print("\n👋 Severing Link. Goodbye.")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()

