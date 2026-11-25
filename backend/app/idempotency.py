"""Idempotency keys for writes.

A client may send `Idempotency-Key: <uuid>` on POST, PUT, PATCH and DELETE. The first request with a given
key (per signed-in user and path) runs normally and its response is kept for 24 hours; a repeat with the same
key gets that same response back instead of running again, marked `Idempotent-Replayed: true`. So a phone that
loses its connection mid-request can safely retry posting a comment or filing a report without doing it twice.

- A repeat that arrives while the first is still running gets 409, and can retry shortly.
- Reusing a key with a different body is a client bug and gets 422.
- 5xx responses aren't kept, so a retry after a server error runs again.
Requests without the header behave exactly as before, and /auth/ is left out so tokens are never stored.
"""

import hashlib
import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.redis_client import redis

HEADER = b"idempotency-key"
WRITES = {"POST", "PUT", "PATCH", "DELETE"}
SKIP_PREFIXES = ("/auth/",)
TTL_SECONDS = 24 * 60 * 60
PENDING_SECONDS = 60
MAX_KEY_LENGTH = 200


def _header(scope: Scope, name: bytes) -> bytes | None:
    for k, v in scope.get("headers", []):
        if k == name:
            return v
    return None


async def _send_json(send: Send, status: int, body: dict, extra: list[tuple[bytes, bytes]] = ()) -> None:
    data = json.dumps(body).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(data)).encode()), *extra]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": data})


class IdempotencyMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        key = _header(scope, HEADER) if scope["type"] == "http" else None
        if not key or scope["method"] not in WRITES or scope["path"].startswith(SKIP_PREFIXES):
            return await self.app(scope, receive, send)
        if len(key) > MAX_KEY_LENGTH:
            return await _send_json(send, 400, {"detail": "Idempotency-Key is too long"})

        # Read the whole body up front: it's fingerprinted, then replayed to the app.
        chunks, more = [], True
        while more:
            message = await receive()
            chunks.append(message.get("body", b""))
            more = message.get("more_body", False)
        body = b"".join(chunks)

        # Keys are scoped to the caller (their token) and the endpoint, so two users can't collide.
        who = hashlib.sha256(_header(scope, b"authorization") or b"anonymous").hexdigest()[:16]
        slot = f"idem:{who}:{scope['method']}:{scope['path']}:{key.decode(errors='replace')}"
        fingerprint = hashlib.sha256(body).hexdigest()

        if not await redis.set(slot, json.dumps({"state": "pending", "fp": fingerprint}), nx=True, ex=PENDING_SECONDS):
            saved = json.loads(await redis.get(slot) or "{}")
            if saved.get("fp") != fingerprint:
                detail = "This Idempotency-Key was already used for a different request"
                return await _send_json(send, 422, {"detail": detail})
            if saved.get("state") == "pending":
                detail = "This request is already being processed. Try again in a moment."
                return await _send_json(send, 409, {"detail": detail})
            replay = [(k.encode(), v.encode()) for k, v in saved["headers"]] + [(b"idempotent-replayed", b"true")]
            await send({"type": "http.response.start", "status": saved["status"], "headers": replay})
            await send({"type": "http.response.body", "body": saved["body"].encode("latin-1")})
            return

        sent_body = False

        async def replay_receive() -> Message:
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        status, headers, out = 500, [], []

        async def capture_send(message: Message) -> None:
            nonlocal status, headers
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = [(k.decode(), v.decode()) for k, v in message.get("headers", [])
                           if k.lower() in (b"content-type", b"location")]
            elif message["type"] == "http.response.body":
                out.append(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, replay_receive, capture_send)
        except Exception:
            await redis.delete(slot)
            raise
        if status >= 500:
            await redis.delete(slot)  # let a retry run again
        else:
            done = {"state": "done", "fp": fingerprint, "status": status, "headers": headers,
                    "body": b"".join(out).decode("latin-1")}
            await redis.set(slot, json.dumps(done), ex=TTL_SECONDS)
