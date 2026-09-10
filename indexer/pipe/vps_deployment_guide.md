# VPS & Cloud Deployment Guide: Token Ingestion Indexer

This guide outlines the steps you need to perform after copying the indexer codebase (`/indexer/pipe`) to your VPS or Cloud Server.

---

## 1. Prerequisites Installation

Ensure your VPS has the necessary runtimes and tools installed.

### Install Docker and Docker Compose
Docker is required to run the indexer processor and the Postgres database.
```bash
# Update package index
sudo apt-get update

# Install Docker
sudo apt-get install -y docker.io

# Install Docker Compose (V2)
sudo apt-get install -y docker-compose-v2

# Start and enable Docker service
sudo systemctl enable --now docker
```

### Install Python & uv/pip
Python is required to run `fetch_tokens.py` which discovers and triggers ingestion for new tokens.
```bash
# Install Python 3 and pip
sudo apt-get install -y python3 python3-pip python3-venv

# Install requests library (required by fetch_tokens.py)
pip3 install requests
```

---

## 2. Environment Configuration

### Setup the `.env` File
Ensure that a `.env` file exists in the directory. You can copy the example:
```bash
cp .env.example .env
```
Open `.env` and configure the following variables:
*   **`SQD_API_KEY`**: Your Subsquid API key (crucial for accessing gateway data).
*   **`ETHERSCAN_API_KEY`**: (Optional) Add your Etherscan API key here.
*   **`DB_PORT`**: Port for Postgres (make sure this port is firewall-protected!).
*   **`GQL_PORT`**: Port for GraphQL playground API.

---

## 3. Launching the Indexer

Run the Docker Compose stack. This will build the containers, apply database migrations, and start indexing the configured chains in the background.

```bash
# Build the images (compiles Typescript code)
docker compose build

# Start the stack in detached (background) mode
docker compose up -d
```

### Verify Everything is Running
```bash
# Check container status
docker compose ps

# Check the logs of the processor to ensure blocks are syncing
docker compose logs -f processor
```

---

## 4. Automating Token Discovery (`fetch_tokens.py`)

To ensure that the indexer automatically catches new trending tokens on the fly without manual intervention, you should set up a **Cron Job** to run the discovery script at regular intervals.

1.  Open the crontab editor:
    ```bash
    crontab -e
    ```

2.  Add a line to run the script every **6 hours** (adjust the path to match your deployment directory on the VPS):
    ```cron
    0 */6 * * * cd /path/to/indexer/pipe && ./fetch_tokens.py >> /path/to/indexer/pipe/fetch_tokens.log 2>&1
    ```

This cron job will:
1.  Fetch new trending pools from GeckoTerminal.
2.  Filter them by your rules.
3.  Automatically resolve their creation block heights.
4.  Run `add_token.sh` to update `tokens.json`.
5.  Re-up/restart the indexer and start backfilling the historical transactions automatically.

---

## 5. Security & Maintenance Best Practices

*   **Database Port Security:** Do **not** expose the `DB_PORT` (e.g., `23798`) or `GQL_PORT` to the public internet unless absolutely necessary. Use your VPS firewall (like `ufw`) to block all incoming traffic to these ports, or bind them to `127.0.0.1` in `docker-compose.yml` to only allow local/SSH-tunneled connections:
    ```yaml
    ports:
      - "127.0.0.1:${DB_PORT}:5432"
    ```
*   **Logs Maintenance:** Docker container logs can grow large over time. It's recommended to configure log rotation in `/etc/docker/daemon.json` or docker-compose:
    ```yaml
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    ```
