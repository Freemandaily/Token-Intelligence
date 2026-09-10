/**
 * components/DeepGraphPage.jsx
 * ----------------------------
 * Standalone deep network analysis page.
 * Rendered by App.jsx when mode === "deep".
 * Does NOT import or touch any existing component.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { fetchDeepGraph, fetchBundling } from "../services/api.js";
import useDeepGraph from "../hooks/useDeepGraph.js";
import InfoPanel from "./InfoPanel.jsx";

const LABEL_COLORS = {
  hub: "#a855f7",
  distributor: "#f97316",
  whale: "#3b82f6",
  mid: "#10b981",
  retail: "#6b7280",
};

const FLAG_LABELS = {
  wash_trade: { label: "Wash Trade", color: "#ef4444" },
  hub_and_spoke: { label: "Hub & Spoke", color: "#f97316" },
  circular_flow: { label: "Circular Flow", color: "#f59e0b" },
  high_betweenness: { label: "High Betweenness", color: "#a855f7" },
};

function Pill({ color, children }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 600,
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#7f77dd", letterSpacing: "0.1em",
        textTransform: "uppercase", marginBottom: 8, paddingBottom: 6,
        borderBottom: "1px solid rgba(255,255,255,0.06)"
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function DeepGraphPage({ display, searchedAddress }) {
  const canvasRef = useRef(null);
  const [minTxCount, setMinTxCount] = useState(3);
  const [minVolPct, setMinVolPct] = useState(0.001);
  const [minDegree, setMinDegree] = useState(2);
  const [minCommunity, setMinCommunity] = useState(3);
  const [pathSource, setPathSource] = useState("");
  const [pathTarget, setPathTarget] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bundlingLoading, setBundlingLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activePanel, setActivePanel] = useState("communities");
  const [showDesc, setShowDesc] = useState(true);

  useDeepGraph(canvasRef, data, setSelectedNode);

  const handleAnalyse = useCallback(async () => {
    const addr = searchedAddress?.trim().toLowerCase();
    if (!addr) return;
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedNode(null);
    try {
      const res = await fetchDeepGraph(addr, {
        minTransferCount: minTxCount,
        minEdgeVolumePct: minVolPct,
        minDegree,
        minCommunitySize: minCommunity,
        source: pathSource.trim() || undefined,
        target: pathTarget.trim() || undefined,
      });
      if (res.error) throw new Error(res.error);
      setData(res);
    } catch (e) {
      setError(e.message || "Failed to fetch deep graph.");
    } finally {
      setLoading(false);
    }
  }, [searchedAddress, minTxCount, minVolPct, minDegree, minCommunity, pathSource, pathTarget]);

  // Auto-fetch when token or filters change.
  useEffect(() => {
    if (searchedAddress) {
      // Use a small timeout to debounce typing in number inputs
      const timer = setTimeout(() => {
        handleAnalyse();
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedAddress, minTxCount, minVolPct, minDegree]);

  const handlePathTrace = useCallback(async () => {
    if (!searchedAddress?.trim() || !pathSource.trim() || !pathTarget.trim()) return;
    setLoading(true);
    try {
      const res = await fetchDeepGraph(searchedAddress.trim().toLowerCase(), {
        minTransferCount: minTxCount,
        minEdgeVolumePct: minVolPct,
        minDegree,
        minCommunitySize: minCommunity,
        source: pathSource.trim(),
        target: pathTarget.trim(),
      });
      if (res.error) throw new Error(res.error);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [searchedAddress, minTxCount, minVolPct, minDegree, minCommunity, pathSource, pathTarget]);

  const handleDetectBundles = useCallback(async () => {
    if (!data || !searchedAddress) return;
    setBundlingLoading(true);
    try {
      const bData = await fetchBundling(searchedAddress.trim().toLowerCase());
      if (bData.error) throw new Error(bData.error);

      const newNodes = [];
      const newEdges = [];

      (bData.bundling_events || []).forEach(ev => {
        const cluster_id = ev.cluster_id;
        const ctype = ev.type || "cluster";

        newNodes.push({
          id: cluster_id,
          type: ctype,
          label: ctype === "airdrop" ? "Airdrop" : (ctype === "bundle" ? "Bundle" : "Cluster"),
          name: ctype === "airdrop" ? "Airdrop Hub" : (ctype === "bundle" ? "Bundle Hub" : "Cluster Hub"),
          walletCount: ev.wallet_count || 0,
          total_volume: String(ev.total_volume || 0),
          balance: "0",
          balance_pct: 0,
          total_volume_in: "0",
          total_volume_out: String(ev.total_volume || 0),
          unique_wallets_in: 0,
          unique_wallets_out: (ev.wallet_count || 0),
          total_txs_received: 0,
          total_txs_made: (ev.wallet_count || 0),
          community_id: "N/A"
        });

        Object.entries(ev.bundler_amounts || {}).forEach(([wallet, amt]) => {
          const wallet_node_id = `${cluster_id}-${wallet}`;
          newNodes.push({
            id: wallet_node_id, // We keep the unique ID
            type: "wallet",
            parentType: ctype,
            actualAddress: wallet, // Store the raw wallet address
            balance: "0",
            balance_pct: 0,
            total_volume_in: String(amt),
            total_volume_out: "0",
            unique_wallets_in: 1,
            unique_wallets_out: 0,
            total_txs_received: 1,
            total_txs_made: 0,
            community_id: "N/A"
          });
          newEdges.push({
            source: cluster_id,
            target: wallet_node_id,
            transfer_count: 1,
            total_volume: String(amt),
            bidirectional: false
          });
        });
      });

      setData(prev => {
        if (!prev) return prev;
        // avoid duplicates if clicked multiple times
        const existingNodeIds = new Set(prev.nodes.map(n => n.id));
        const filteredNewNodes = newNodes.filter(n => !existingNodeIds.has(n.id));

        return {
          ...prev,
          nodes: [...prev.nodes, ...filteredNewNodes],
          edges: [...prev.edges, ...newEdges],
          bundling_events: bData.bundling_events || []
        };
      });
    } catch (e) {
      console.error("Bundling error:", e);
      setError(e.message || "Failed to fetch bundles.");
    } finally {
      setBundlingLoading(false);
    }
  }, [data, searchedAddress]);

  return (
    <div style={{ position: "relative", display: display ? "flex" : "none", flexDirection: "column", height: "100%", fontFamily: "Inter, sans-serif" }}>

      {/* ── Controls bar ───────────────────────────────────────────── */}
      <div style={{
        position: "relative", zIndex: 50,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10,10,20,0.9)", backdropFilter: "blur(12px)",
      }}>

        {/* Filter inputs removed per user request */}

        {/* Removed Apply Filters button per user request */}

        <button
          onClick={handleDetectBundles}
          disabled={bundlingLoading || !data || (data && data.bundling_events && data.bundling_events.length > 0)}
          style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #ffffff", cursor: "pointer",
            background: bundlingLoading ? "rgba(127, 119, 221, 0.2)" : "rgba(127, 119, 221, 0.1)",
            color: "#7f77dd", fontSize: 12, fontWeight: 600,
            opacity: (!data || (data && data.bundling_events && data.bundling_events.length > 0)) ? 0.4 : 1,
            transition: "all 0.2s"
          }}
        >
          {bundlingLoading ? "Detecting..." : (data?.bundling_events?.length > 0 ? "Bundles Detected" : "Detect Bundles")}
        </button>

        {showDesc && (
          <div style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(127,119,221,0.1)",
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 12,
            color: "rgba(255,255,255,0.8)",
            marginLeft: 10,
          }}>
            <span style={{ marginRight: 8 }}>
              <strong style={{ color: "#7f77dd" }}>Deep Analysis:</strong> Maps full transfer history to automatically uncover hidden clusters, insider rings, and coordinated accumulation.
            </span>
            <button
              onClick={() => setShowDesc(false)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16, padding: "0 4px" }}
              title="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        <InfoPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          tokenAddress={searchedAddress}
          chain={data?.chain}
          communities={data?.communities}
        />

        {/* Canvas */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

          {/* Empty / error state */}
          {!data && !loading && !error && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              color: "rgba(255,255,255,0.3)", fontSize: 14, gap: 12,
            }}>
              <div style={{ fontSize: 48, opacity: 0.4 }}>⬡</div>
              <div>Enter a token address and click Analyse</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>Uses full transfer history — thresholds filter noise</div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: "rgba(10, 10, 20, 0.7)", backdropFilter: "blur(4px)",
              color: "#7f77dd", fontSize: 15, gap: 16, zIndex: 10
            }}>
              <div style={{
                width: 40, height: 40, border: "3px solid rgba(127, 119, 221, 0.2)",
                borderTopColor: "#7f77dd", borderRadius: "50%",
                animation: "spin 1s linear infinite"
              }} />
              <div style={{ fontWeight: 600, letterSpacing: "0.05em" }}>
                Computing Deep Analysis...
              </div>
              <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
              `}</style>
            </div>
          )}

          {error && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center",
            }}>
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
                padding: "16px 28px", borderRadius: 8, color: "#ef4444", fontSize: 13,
                maxWidth: 500, textAlign: "center",
              }}>
                ⚠ {error}
              </div>
            </div>
          )}

        </div>

        {/* Sidebar removed per user request */}

      </div>
    </div>
  );
}
