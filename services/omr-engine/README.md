# OMR Engine

The OMR Engine is a private FastAPI service. Do not expose it directly to browsers or commit real credentials.

## Local setup

```bash
cd services/omr-engine
python -m venv .venv
# Activate the virtual environment, then:
python -m pip install -e '.[dev]'
cp .env.example .env
```

Set `OMR_ENGINE_API_KEY` to a long random secret in the service environment. The Next.js server will use the same value when proxying authenticated requests. Never expose this key through a `NEXT_PUBLIC_*` variable.

Run the service with:

```bash
uvicorn app.main:app --reload
```

## Scan intake contract

`POST /v1/scans/intake` accepts multipart field `file` and requires:

```
Authorization: Bearer <OMR_ENGINE_API_KEY>
```

Accepted formats are JPEG, PNG, and WebP. The endpoint enforces a 10 MB upload limit, 20 megapixel limit, and minimum 800 × 1000 dimensions. It validates actual image bytes rather than trusting the filename, checks declared MIME type against decoded format, and applies EXIF orientation.

The response contains an SHA-256 content fingerprint, decoded image dimensions, and conservative portrait/contrast checks. It does not persist the upload, detect registration marks, recognize bubbles, identify candidates, or grade answers. `review_required` means an operator should inspect the image before later processing.

## Tests

```bash
ruff check .
pytest
```
