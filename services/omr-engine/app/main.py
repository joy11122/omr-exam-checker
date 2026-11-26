from fastapi import FastAPI

app = FastAPI(
    title="OMR Engine",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)


@app.get("/health", tags=["operations"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "omr-engine"}
