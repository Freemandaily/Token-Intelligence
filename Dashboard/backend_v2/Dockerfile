# Use Python 3.11 slim as base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory
WORKDIR /app

# Install Python dependencies (no psycopg2/libpq needed: DuckDB reads Parquet directly)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Parquet files are provided at runtime via a volume mount at /data/parquet
ENV PARQUET_ROOT=/data/parquet
ENV DUCKDB_PATH=/tmp/backend_v2.duckdb

# Expose the API port
EXPOSE 8000

# Start the application using uvicorn
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
