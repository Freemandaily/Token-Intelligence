# Token Intelligence

A modern, lightweight data engineering and analytics platform built around **DuckDB**, **Parquet**, and **dbt**. 

This project demonstrates how to build a highly efficient, performant data pipeline and serving layer *without* the overhead of spinning up, managing, or paying for a full traditional database instance (like PostgreSQL, Redshift, or Snowflake).

## Architecture & Data Stack

- **Storage Layer**: [Parquet](https://parquet.apache.org/) - Data is stored as columnar Parquet files, providing excellent compression and fast read performance.
- **Query & Compute Engine**: [DuckDB](https://duckdb.org/) - An incredibly fast, in-process analytical SQL database. DuckDB queries our Parquet files directly using its vectorized execution engine.
- **Transformation**: [dbt (data build tool)](https://www.getdbt.com/) - Used to model and transform raw data into clean, business-ready aggregations (`dbt_model/`).
- **Serving Layer**: [FastAPI](https://fastapi.tiangolo.com/) - A Python web framework (`Dashboard/backend/`) that reads directly from the compiled `analytics.duckdb` file to serve low-latency analytical queries to the frontend.

## Why DuckDB + Parquet?

Traditional data engineering stacks usually require moving data into a bulky data warehouse or a running database server. This project uses a **Local-First / Serverless** approach:

1. **Zero Infrastructure Overhead**: There is no database server to spin up, configure, scale, or maintain. The database is just a file (`analytics.duckdb`).
2. **Massive Scale on a Single Node**: DuckDB is capable of seamlessly processing millions (and even billions) of rows of data locally. It is specifically designed for OLAP (Online Analytical Processing) and reads columnar Parquet files instantly, performing complex aggregations and joins at lightning speed without needing a distributed computing cluster.
3. **Portability**: Because the database is file-based, deploying the application is as simple as bundling the `.duckdb` file into our Docker container (see our `Dockerfile`). This guarantees that what runs locally runs exactly the same in production.
4. **Cost Efficiency**: Traditional databases (like AWS RDS, Snowflake, or Redshift) charge a baseline hourly fee just to keep the server running 24/7, even when idle. Because DuckDB is file-based and runs inside the application process, you completely eliminate these dedicated database costs. You only pay for the basic compute used when an API request is actively being processed.

## Project Structure

```text
token_intelligence/
├── dbt_model/           # dbt project for data transformation (SQL models)
├── data/                # Raw/Processed data (Parquet format)
├── Dashboard/           # Full-stack application
│   └── backend/         # FastAPI application serving queries from DuckDB
└── README.md
```

## Getting Started

### 1. Data Transformation (dbt)
Our transformations run directly against the local data using the `dbt-duckdb` adapter.
```bash
cd dbt_model
dbt deps
dbt run
```
*This compiles your raw data and generates the `analytics.duckdb` database file.*

### 2. Running the API Backend
The FastAPI backend connects directly to the DuckDB file to serve endpoints.
```bash
cd Dashboard/backend
pip install -r requirements.txt
uvicorn api.main:app --reload
```

### 3. Docker Deployment
The application is fully containerized. The `Dockerfile` simply copies the built `analytics.duckdb` file alongside the Python API code, providing an instant, read-only analytical backend that can be deployed anywhere.
