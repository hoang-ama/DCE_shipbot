from __future__ import annotations
import json
import os
import select
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock, Thread

MODEL_ID = os.environ.get("QWEN_MODEL_ID", "Qwen/Qwen3-0.6B")
HOST = os.environ.get("QWEN_HOST", "127.0.0.1")
PORT = int(os.environ.get("QWEN_PORT", "8765"))
MAX_INPUT_TOKENS = int(os.environ.get("QWEN_MAX_INPUT_TOKENS", "4096"))
_generation_lock = Lock()
_tokenizer = None
_model = None
_torch = None
_warmup_status = "pending"
_warmup_error = None

def load_model():
    global _tokenizer, _model, _torch
    if _model is not None:
        return
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    _torch = torch
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    _model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype="auto",
        device_map="auto",
        low_cpu_mem_usage=True,
    )
    _model.eval()

def generate(system: str, user_input: object, max_new_tokens: int, should_stop=None) -> tuple[str, int]:
    if should_stop is None:
        _generation_lock.acquire()
    else:
        while not _generation_lock.acquire(timeout=0.25):
            if should_stop():
                print("[Qwen worker] Client disconnected while waiting for the generation lock.")
                return "", 0
        if should_stop():
            _generation_lock.release()
            print("[Qwen worker] Client disconnected before inference started.")
            return "", 0

    try:
        load_model()
        text = json.dumps(user_input, ensure_ascii=False)
        messages = [{"role": "system", "content": system}, {"role": "user", "content": text}]
        try:
            prompt = _tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        except TypeError:
            prompt = _tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        encoded = _tokenizer(prompt, return_tensors="pt", truncation=True, max_length=MAX_INPUT_TOKENS)
        input_device = _model.get_input_embeddings().weight.device
        encoded = {key: value.to(input_device) for key, value in encoded.items()}
        stopping_criteria = None
        if should_stop is not None:
            from transformers import StoppingCriteria, StoppingCriteriaList

            class StopOnDisconnect(StoppingCriteria):
                reported = False

                def __call__(self, input_ids, scores, **kwargs):
                    disconnected = should_stop()
                    if disconnected and not self.reported:
                        print("[Qwen worker] Client disconnected during generation; stopping inference.")
                        self.reported = True
                    return disconnected

            stopping_criteria = StoppingCriteriaList([StopOnDisconnect()])
        with _torch.inference_mode():
            started = time.perf_counter()
            output = _model.generate(
                **encoded,
                max_new_tokens=max(32, min(max_new_tokens, 1200)),
                do_sample=False,
                use_cache=True,
                stopping_criteria=stopping_criteria,
            )
            elapsed_ms = int((time.perf_counter() - started) * 1000)
        answer = _tokenizer.decode(output[0][encoded["input_ids"].shape[-1]:], skip_special_tokens=True).strip()
        return answer, elapsed_ms
    finally:
        _generation_lock.release()

def warmup_model():
    global _warmup_status, _warmup_error
    _warmup_status = "warming"
    print(f"[Qwen worker] Startup warm-up started for {MODEL_ID}.")
    try:
        answer, elapsed_ms = generate(
            "You are an internal startup check. Reply with exactly: OK",
            {"message": "Start-up check. Reply with OK."},
            32,
        )
        if not answer:
            raise RuntimeError("QWEN_WARMUP_EMPTY_RESPONSE")
        _warmup_status = "ready"
        print(f"[Qwen worker] Startup warm-up completed in {elapsed_ms} ms.")
    except Exception as exc:
        _warmup_error = f"{type(exc).__name__}: {exc}"
        _warmup_status = "error"
        print(f"[Qwen worker] Startup warm-up failed: {_warmup_error}")

class Handler(BaseHTTPRequestHandler):
    def _client_disconnected(self) -> bool:
        try:
            readable, _, _ = select.select([self.connection], [], [], 0)
            if not readable:
                return False
            return self.connection.recv(1, socket.MSG_PEEK | socket.MSG_DONTWAIT) == b""
        except (BlockingIOError, InterruptedError):
            return False
        except OSError:
            return True

    def _send(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            print("[Qwen worker] Client disconnected before the response was sent.")
            return False
        return True
    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {
                "ok": True,
                "ready": _warmup_status == "ready",
                "warmup_status": _warmup_status,
                "warmup_error": _warmup_error,
                "model": MODEL_ID,
                "loaded": _model is not None,
            })
        return self._send(404, {"error": "not_found"})
    def do_POST(self):
        if self.path != "/generate":
            return self._send(404, {"error": "not_found"})
        try:
            payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            answer, elapsed_ms = generate(
                str(payload.get("system", "")),
                payload.get("input", {}),
                int(payload.get("max_new_tokens", 512)),
                should_stop=self._client_disconnected,
            )
            print(f"[Qwen worker] Inference finished in {elapsed_ms} ms.")
        except Exception as exc:
            print(f"[Qwen worker] Generation failed: {type(exc).__name__}: {exc}")
            return self._send(500, {"error": f"{type(exc).__name__}: {exc}"})
        return self._send(200, {"text": answer, "elapsed_ms": elapsed_ms, "model": MODEL_ID})
    def log_message(self, fmt, *args):
        print("[Qwen worker] " + fmt % args)

if __name__ == "__main__":
    print(f"Starting {MODEL_ID} worker with startup warm-up; listening at http://{HOST}:{PORT}")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    Thread(target=warmup_model, name="qwen-startup-warmup", daemon=True).start()
    server.serve_forever()
