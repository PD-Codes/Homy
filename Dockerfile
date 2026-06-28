FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md MANIFEST.in ./
COPY homy/ ./homy/

RUN pip install --no-cache-dir . \
    && apt-get purge -y --auto-remove gcc python3-dev \
    && rm -rf /var/lib/apt/lists/* /root/.cache

RUN mkdir -p /app/data \
    && useradd --no-create-home --shell /bin/false homy \
    && chown -R homy:homy /app

USER homy

ENV FLASK_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/')" || exit 1

CMD ["homy"]
