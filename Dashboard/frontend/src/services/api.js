/**
 * services/api.js
 * ---------------
 * HTTP calls to the token_intelligence FastAPI backend.
 *
 * Actual endpoints (from the backend zip):
 *   GET /api/v1/graph/{token_address}
 *       → { token_address, total_holders, total_edges, computed_at,
 *            nodes: [{id, balance, balance_pct, pagerank, degree,
 *                     in_degree, out_degree, community_id, wallet_type}],
 *            edges: [{source, target, transfer_count, total_volume, direction}],
 *            communities: [{community_id, wallet_count, balance_pct, label}] }
 *
 *   GET /api/v1/distribution/{token_address}
 *       → { token_address, total_supply, holder_count,
 *            concentration: {gini, hhi, top_10_pct, top_50_pct, score},
 *            top_holders: [{wallet_address, balance, balance_pct, wallet_type}] }
 *
 *   GET /
 *       → { status, message }
 */
// "https://inteli-backend.onrender.com";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

async function request(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "API error");
  }
  return res.json();
}

/**
 * Fetch wallet graph — nodes, edges, Louvain communities, PageRank.
 * @param {string} tokenAddress  ERC-20 contract address (0x…)
 */
export async function fetchGraph(tokenAddress, limit = 250) {
  return request(`/api/v1/graph/${tokenAddress}?limit=${limit}`);
}

/**
 * Fetch distribution analysis — Gini, HHI, top holders, concentration score.
 * @param {string} tokenAddress  ERC-20 contract address (0x…)
 */
export async function fetchDistribution(tokenAddress) {
  return request(`/api/v1/distribution/${tokenAddress}`);
}

/**
 * Fetch wallet forensic graph for tracing 1-hop transactions.
 * @param {string} walletAddress  Wallet address (0x…)
 */
export async function fetchForensics(walletAddress) {
  return request(`/api/v1/forensics/${walletAddress}`);
}

/** Health check. */
export async function fetchHealth() {
  return request(`/`);
}

/**
 * Fetch bundling analysis events.
 */
export async function fetchBundling(tokenAddress, maxBlockGap = 0, minWallets = 10) {
  return request(`/api/v1/bundling/${tokenAddress}?max_block_gap=${maxBlockGap}&min_wallets=${minWallets}`);
}

/**
 * Fetch available tokens for analysis.
 */
export async function fetchAvailableTokens() {
  return request(`/api/v1/tokens/`);
}

/**
 * Fetch deep network analysis for a token (v2 endpoint).
 * @param {string} tokenAddress   ERC-20 contract address
 * @param {Object} params         Threshold + optional path params
 */
export async function fetchDeepGraph(tokenAddress, params = {}) {
  const q = new URLSearchParams();
  if (params.minTransferCount != null) q.set("min_transfer_count", params.minTransferCount);
  if (params.minEdgeVolumePct != null) q.set("min_edge_volume_pct", params.minEdgeVolumePct);
  if (params.minDegree != null) q.set("min_degree", params.minDegree);
  if (params.minCommunitySize != null) q.set("min_community_size", params.minCommunitySize);
  if (params.source) q.set("source", params.source);
  if (params.target) q.set("target", params.target);
  const qs = q.toString() ? `?${q.toString()}` : "";
  return request(`/api/v2/deep-graph/${tokenAddress}${qs}`);
}
