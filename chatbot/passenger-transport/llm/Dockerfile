FROM python:3.12-slim

WORKDIR /app
ENV HF_HOME=/data/huggingface \
    QWEN_HOST=0.0.0.0 \
    QWEN_PORT=8765 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY serve_qwen.py ./serve_qwen.py

EXPOSE 8765
CMD ["uv", "run", "--no-sync", "python", "serve_qwen.py"]
