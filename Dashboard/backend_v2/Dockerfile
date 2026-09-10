# Use Python 3.11 slim as base image
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure mount point exists; app now starts in degraded mode if Parquet is missing
# and reports status via GET /. For Render, either:
#   a) Set dockerContext to ./Dashboard so Data/parquet is baked in (see render.yaml), or
#   b) Attach a Render Disk mounted at /data/parquet
RUN mkdir -p /data/parquet

ENV PARQUET_ROOT=/data/parquet
ENV DUCKDB_PATH=/tmp/backend_v2.duckdb

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
