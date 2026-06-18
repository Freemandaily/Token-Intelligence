# Token Intelligence API

Analyze ERC-20 token distribution and wallet connectivity on Ethereum.

## Setup

```bash
# 1. copy env file
cp .env.example .env
# fill in your postgres credentials

# 2. install dependencies
pip install -r requirements.txt

# 3. run the API
uvicorn api.main:app --reload --port 8000
```

## API Docs
- Swagger UI → http://localhost:8000/docs
- ReDoc      → http://localhost:8000/redoc
- Health     → http://localhost:8000/

## Endpoints

### Distribution
GET /api/v1/distribution/{token_address}
→ Gini, HHI, top holders, concentration score

### Graph
GET /api/v1/graph/{token_address}
→ nodes, edges, communities for graph visualization

## Project Structure
```
token_intelligence/
├── api/
│   ├── main.py
│   ├── routers/
│   │   ├── distribution.py
│   │   └── graph.py
│   └── models/
│       ├── distribution.py
│       └── graph.py
├── analytics/
│   ├── distribution.py
│   └── graph.py
├── data/
│   ├── db.py
│   ├── transfers.py
│   └── balances.py
├── core/
│   └── config.py
├── requirements.txt
└── .env.example
```
