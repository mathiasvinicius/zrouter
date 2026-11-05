#!/usr/bin/env python3
import json, subprocess, time, uuid, os, base64
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler

MODELS = [
    {"id": "gemini-4-argon", "object": "model", "owned_by": "agy"},
    {"id": "gemini-4-argon-medium", "object": "model", "owned_by": "agy"},
    {"id": "gemini-4-argon-high", "object": "model", "owned_by": "agy"},
    {"id": "gemini-4-argon-low", "object": "model", "owned_by": "agy"},
    {"id": "gemini-3.8-flash-high", "object": "model", "owned_by": "agy"},
    {"id": "gemini-3.8-flash-medium", "object": "model", "owned_by": "agy"},
    {"id": "gemini-3.8-flash-low", "object": "model", "owned_by": "agy"},
    {"id": "claude-opus-5-5-high", "object": "model", "owned_by": "agy"},
    {"id": "claude-opus-5-5-medium", "object": "model", "owned_by": "agy"},
    {"id": "claude-opus-5-5-low", "object": "model", "owned_by": "agy"},
    {"id": "claude-sonnet-5-5-high", "object": "model", "owned_by": "agy"},
    {"id": "claude-sonnet-5-5-medium", "object": "model", "owned_by": "agy"},
    {"id": "claude-sonnet-5-5-low", "object": "model", "owned_by": "agy"},
    {"id": "gpt-oss-120b-medium", "object": "model", "owned_by": "agy"}
]

WRITE_DIR = "/tmp"  # Usar pasta tmp para arquivos grandes

class AgyHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        if self.path in ["/v1/models", "/models"]:
            self._send_json(200, {"object": "list", "data": MODELS})
        elif self.path in ["/health", "/v1/health"]:
            self._send_json(200, {"status": "ok"})
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path not in ["/v1/chat/completions", "/chat/completions"]:
            self._send_json(404, {"error": "Endpoint not found"})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        try:
            req = json.loads(body)
        except Exception as e:
            self._send_json(400, {"error": f"Invalid JSON: {e}"})
            return

        model = req.get("model", "gemini-4-argon")
        if "/" in model:
            model = model.split("/")[-1]

        messages = req.get("messages", [])

        # PEGAR APENAS A ÚLTIMA MENSAGEM - evita E2BIG (Argument list too long) e acelera
        last_msg = messages[-1] if messages else {"role": "user", "content": ""}
        content = last_msg.get("content", "")
        audio_refs = []
        if isinstance(content, list):
            text_parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
            for c in content:
                if not (isinstance(c, dict) and c.get("type") == "input_audio"):
                    continue
                ia = c.get("input_audio", {}) or {}
                data = ia.get("data")
                fmt = (ia.get("format") or "mp3").lower()
                ext = {"mp3":"mp3","wav":"wav","ogg":"ogg","flac":"flac","m4a":"m4a","webm":"webm","mpeg":"mp3","mp4":"mp4","aac":"aac","opus":"opus"}.get(fmt, "mp3")
                try:
                    audio_path = os.path.join(WRITE_DIR, f"agy-audio-{uuid.uuid4().hex[:10]}.{ext}")
                    with open(audio_path, "wb") as af:
                        af.write(base64.b64decode(data))
                    audio_refs.append(audio_path)
                except Exception:
                    pass
            content = "\n".join(text_parts)
        prompt = str(content)

        # Escreve o prompt num arquivo temporário ao invés de passar por argv (evita E2BIG)
        prompt_file = os.path.join(WRITE_DIR, f"agy-prompt-{uuid.uuid4()}.txt")
        with open(prompt_file, "w", encoding="utf-8") as f:
            f.write(prompt)

        cmd = [
            "/root/.local/bin/agy",
            "--model", model,
            "--output-format", "json",
            "--stdin",  # Se agy aceitar stdin
            # ou sem stdin - vamos духе usar arquivo como fallback
        ]

        # Como o agy aceita --print "prompt", vamos ler do arquivo e passar como argumento truncado
        # para evitar E2BIG. Se for muito grande, corta para 8000 chars. Os @refs de áudio entram
        # no FIM do prompt (nunca cortados pelo truncate).
        safe_prompt = prompt[:8000]
        for ref in audio_refs:
            safe_prompt += f" @{ref}"

        cmd = [
            "/root/.local/bin/agy",
            "--model", model,
            "--output-format", "json",
            "--print", safe_prompt
        ]

        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            # Limpar arquivo temporário
            try:
                os.unlink(prompt_file)
            except:
                pass
            for ref in audio_refs:
                try:
                    os.unlink(ref)
                except:
                    pass

            if p.returncode != 0:
                self._send_json(500, {"error": f"agy failed (rc={p.returncode}): {p.stderr[:300]}"})
                return
            out = json.loads(p.stdout)
            reply_text = out.get("response", "").strip()
            usage = out.get("usage", {})

            resp = {
                "id": f"chatcmpl-{uuid.uuid4()}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": reply_text
                        },
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": usage.get("input_tokens", 0),
                    "completion_tokens": usage.get("output_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0)
                }
            }
            self._send_json(200, resp)
        except subprocess.TimeoutExpired:
            self._send_json(504, {"error": "agy command timed out"})
        except Exception as e:
            self._send_json(500, {"error": f"Internal error: {str(e)[:300]}"})

if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 20130), AgyHandler)
    print("AGY Bridge ouvindo em http://127.0.0.1:20130")
    server.serve_forever()
