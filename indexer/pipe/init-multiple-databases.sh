#!/bin/bash
set -e

if [ -n "$POSTGRES_SECOND_DB" ]; then
    echo "Creating second database: $POSTGRES_SECOND_DB"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        CREATE DATABASE "$POSTGRES_SECOND_DB";
EOSQL
    echo "Second database created successfully."
fi
