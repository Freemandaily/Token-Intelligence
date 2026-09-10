FROM node:20-alpine

WORKDIR /squid

RUN apk add --no-cache g++ make python3

COPY package.json package-lock.json tsconfig.json ./

RUN npm ci

COPY src src
COPY schema.graphql schema.graphql
COPY tokens.json tokens.json
COPY db db

RUN npm run build
