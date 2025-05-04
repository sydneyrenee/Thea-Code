import requests
import json

# --- Configuration ---
OLLAMA_BASE_URL = "http://localhost:10000"
MODEL_NAME = "gemma3:1b" # Using gemma3:1b from your list
API_ENDPOINT = f"{OLLAMA_BASE_URL}/v1/chat/completions"
# --- ------------- ---

def test_ollama_roles(messages):
    """Sends a request to the Ollama API and prints the response."""
    headers = {"Content-Type": "application/json"}
    data = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": False # Keep it simple for testing
    }

    print("-" * 40)
    print(f"Testing with roles: {[msg['role'] for msg in messages]}")
    print("Sending messages:")
    for msg in messages:
        print(f"  - {msg['role']}: {msg['content']}")

    try:
        response = requests.post(API_ENDPOINT, headers=headers, data=json.dumps(data), timeout=60)
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)

        response_data = response.json()
        assistant_message = response_data.get("choices", [{}])[0].get("message", {})
        content = assistant_message.get("content", "No content received.")

        print("\nModel Response:")
        print(content)
        print("-" * 40 + "\n")

    except requests.exceptions.RequestException as e:
        print(f"\nError connecting to Ollama API at {API_ENDPOINT}: {e}")
        print("Please ensure Ollama is running and accessible at the specified URL.")
        print("-" * 40 + "\n")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        print("-" * 40 + "\n")

# --- Test Cases ---

# 1. User only
test_case_1 = [
    {"role": "user", "content": "What is the capital of France?"}
]

# 2. System + User
test_case_2 = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
]

# 3. User + Assistant + User
test_case_3 = [
    {"role": "user", "content": "What is the capital of France?"},
    {"role": "assistant", "content": "The capital of France is Paris."},
    {"role": "user", "content": "What is its population?"}
]

# 4. System + User + Assistant + User
test_case_4 = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"},
    {"role": "assistant", "content": "The capital of France is Paris."},
    {"role": "user", "content": "What is its population?"}
]

# 5. System message appearing later (potentially problematic)
test_case_5 = [
    {"role": "user", "content": "What is the capital of France?"},
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Does the previous message influence you?"}
]


# --- Run Tests ---
if __name__ == "__main__":
    print(f"Starting Ollama role test for model: {MODEL_NAME} at {OLLAMA_BASE_URL}")
    test_ollama_roles(test_case_1)
    test_ollama_roles(test_case_2)
    test_ollama_roles(test_case_3)
    test_ollama_roles(test_case_4)
    test_ollama_roles(test_case_5)
    print("Tests finished.")