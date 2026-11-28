# Local Qwen worker

For normal local development, run npm run dev from the DCE_shipbot root. The dev launcher checks port 8765, reuses an existing worker or starts one with uv, then starts the Node server. The production chat pipeline remains on Gemini; only the passenger-transport experiment sends requests to Qwen.

The Qwen weights load on the first passenger experiment request and are cached by Hugging Face. No .env file is needed. The worker defaults to 127.0.0.1:8765. To run it manually instead, use:

- uv sync --project chatbot/passenger-transport/llm
- uv run --project chatbot/passenger-transport/llm python chatbot/passenger-transport/llm/serve_qwen.py
