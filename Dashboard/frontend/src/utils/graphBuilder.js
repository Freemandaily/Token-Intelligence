/**
 * utils/graphBuilder.js
 * ---------------------
 * Converts the real backend response from GET /api/v1/graph/{token_address}
 * into canvas-ready node and edge objects.
 *
 * Community detection is done server-side by the backend (python-louvain).
 * We just map community_id → colour and compute circular positions.
 *
 * Backend node shape:
 *   { id, balance, balance_pct, pagerank, degree,
 *     in_degree, out_degree, community_id, wallet_type }
 *
 * Backend edge shape:
 *   { source, target, transfer_count, total_volume, direction }
 *
 * Backend community shape:
 *   { community_id, wallet_count, balance_pct, label }
 */

export const COMMUNITY_PALETTE = [
  "#7f77dd", // purple
  "#1d9e75", // teal
  "#e24b4a", // red
  "#ffb347", // amber
  "#3B8BD4", // blue
  "#D85A30", // coral
  "#D4537E", // pink
  "#639922", // green
  "#BA7517", // amber-dark
  "#888780", // gray
];

/**
 * Build canvas nodes from the backend /graph response.
 * Positions are circular — each community clusters around a point on a ring.
 *
 * @param {object[]} apiNodes       — backend nodes array
 * @param {object[]} apiCommunities — backend communities array (sorted by balance_pct desc)
 * @param {number}   W              — canvas width
 * @param {number}   H              — canvas height
 * @returns {object[]} canvas-ready node objects keyed by wallet id
 */
export function buildNodes(apiNodes, apiCommunities, W, H) {
  const cx = W / 2;
  const cy = H / 2;
  const ringR = Math.min(W, H) * 0.3;

  // Map community_id → stable colour (ordered by balance_pct so the
  // largest community always gets palette[0])
  const commColorMap = {};
  apiCommunities.forEach((c, i) => {
    commColorMap[c.community_id] = COMMUNITY_PALETTE[i % COMMUNITY_PALETTE.length];
  });

  // Max pagerank for radius scaling
  const maxPagerank = Math.max(...apiNodes.map((n) => n.pagerank), 0.001);
  const maxBalancePct = Math.max(...apiNodes.map((n) => n.balance_pct), 0.001);

  const canvasNodes = [];

  // Give nodes random starting coordinates near the centre
  apiNodes.forEach((n) => {
    const cid = n.community_id;
    const color = commColorMap[cid] ?? "#888780";

    canvasNodes.push({
      // identity
      id:           n.id,
      wallet:       n.id,
      name:         n.name,

      // from backend
      balance:      parseFloat(n.balance),
      balance_pct:  n.balance_pct,
      pagerank:     n.pagerank,
      degree:       n.degree,
      in_degree:    n.in_degree,
      out_degree:   n.out_degree,
      community_id: cid,
      wallet_type:  n.wallet_type,
      total_volume_in: n.total_volume_in,
      total_volume_out: n.total_volume_out,
      unique_wallets_in: n.unique_wallets_in,
      unique_wallets_out: n.unique_wallets_out,

      // visual
      color,
      x:       cx + (Math.random() - 0.5) * W * 0.3,
      y:       cy + (Math.random() - 0.5) * H * 0.3,
      vx:      0,
      vy:      0,
      r:       5 + (n.balance_pct / maxBalancePct) * 10
             + (n.pagerank     / maxPagerank)     * 6,
      opacity: 0,
    });
  });

  return canvasNodes;
}

/**
 * Build canvas edges from the backend /graph response.
 * Maps wallet address strings → canvas node array indices.
 *
 * @param {object[]} apiEdges    — backend edges array
 * @param {object[]} canvasNodes — output of buildNodes()
 * @returns {Array<{from, to, weight, transfer_count, total_volume}>}
 */
export function buildEdges(apiEdges, canvasNodes) {
  // wallet address → index in canvasNodes
  const idxMap = {};
  canvasNodes.forEach((n, i) => { idxMap[n.id] = i; });

  const edges = [];
  apiEdges.forEach((e) => {
    const from = idxMap[e.source];
    const to   = idxMap[e.target];
    if (from === undefined || to === undefined) return;

    const vol = parseFloat(e.total_volume) || 0;
    edges.push({
      source: from,
      target: to,
      weight:         Math.min(0.5 + Math.log1p(vol) * 0.15, 3),
      transfer_count: e.transfer_count,
      total_volume:   vol,
    });
  });
  return edges;
}

/**
 * Build legend-ready community objects from the backend communities array.
 * Attaches the colour that was assigned in buildNodes().
 *
 * @param {object[]} apiCommunities — backend communities array
 * @returns {object[]}
 */
export function buildCommunities(apiCommunities) {
  return apiCommunities.map((c, i) => ({
    id:           c.community_id,
    label:        c.label
                    ? c.label.charAt(0).toUpperCase() + c.label.slice(1)
                    : `Community ${i + 1}`,
    color:        COMMUNITY_PALETTE[i % COMMUNITY_PALETTE.length],
    wallets:      c.wallet_count,
    balance_pct:  c.balance_pct,
  }));
}
