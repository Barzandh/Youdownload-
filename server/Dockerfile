# VidVault download server — used by the web app (iPhone / iPad / desktop).
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# yt-dlp needs a JavaScript runtime for full YouTube support
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno
WORKDIR /app
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/app.py .
ENV PORT=8000 PYTHONUNBUFFERED=1
EXPOSE 8000
# refresh yt-dlp on every start so site changes are picked up, then run
CMD ["sh", "-c", "pip install -q --no-cache-dir -U 'yt-dlp[default]' >/dev/null 2>&1 || true; exec python app.py"]
