/**
 * App.jsx
 * -------
 * Root component. Wired to the token_intelligence FastAPI backend.
 *
 * Flow:
 *   1. User types a token address and hits Analyse
 *   2. fetchGraph() + fetchDistribution() fire in parallel
 *   3. Graph response → buildNodes() + buildEdges() + buildCommunities()
 *   4. Canvas nodes/edges pushed into useGraph render loop
 *   5. Distribution response → StatsBar
 *
 * Backend endpoints used:
 *   GET /api/v1/graph/{token_address}        → nodes, edges, communities
 *   GET /api/v1/distribution/{token_address} → gini, hhi, score, top holders
 */

import { useRef, useState, useCallback, useEffect } from "react";

import TopBar from "./components/TopBar.jsx";
import InfoPanel from "./components/InfoPanel.jsx";
import StatsBar from "./components/StatsBar.jsx";
import AddressList from "./components/AddressList.jsx";
import TokenDiscovery from "./components/TokenDiscovery.jsx";
import TokenSidebar from "./components/TokenSidebar.jsx";


import { useGraph } from "./hooks/useGraph.js";
import { fetchGraph, fetchDistribution, fetchAvailableTokens, fetchBundling } from "./services/api.js";
import { buildNodes, buildEdges, buildCommunities } from "./utils/graphBuilder.js";

export default function App() {
  const canvasRef = useRef(null);
  const { loadGraph, selectedNode, clearSelection, selectNodeById, redraw, zoomIn, zoomOut, resetZoom } = useGraph(canvasRef);

  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [distribution, setDistribution] = useState(null);
  const [graphMeta, setGraphMeta] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [magicNodes, setMagicNodes] = useState(false);
  const [rawGraphRes, setRawGraphRes] = useState(null);
  const [hiddenNodes, setHiddenNodes] = useState(new Set());
  const [canvasNodes, setCanvasNodes] = useState([]);
  const canvasNodesRef = useRef([]);

  const [searchedAddress, setSearchedAddress] = useState("");
  const [availableTokens, setAvailableTokens] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchAvailableTokens().then(data => {
      if (mounted) setAvailableTokens(data);
    }).catch(err => console.error("Failed to load tokens:", err));
    return () => { mounted = false; };
  }, []);



  const toggleNodeVisibility = useCallback((nodeId) => {
    setHiddenNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleSearch = useCallback(async (tokenAddress) => {
    if (!tokenAddress) return;
    setLoading(true);
    setStatus("Fetching graph…");
    clearSelection();
    setRawGraphRes(null);
    setHiddenNodes(new Set());
    setErrorMsg(null);
    setSearchedAddress(tokenAddress);

    try {


      const graphRes = await fetchGraph(tokenAddress);
      setRawGraphRes(graphRes);

      setStatus(
        `${graphRes.total_holders.toLocaleString()} holders · ` +
        `${graphRes.total_edges.toLocaleString()} edges · ` +
        `${graphRes.communities.length} communities`
      );

      // Fire off bundle detection in the background
      fetchBundling(tokenAddress).then(bData => {
        if (bData.bundling_events && bData.bundling_events.length > 0) {
          setRawGraphRes(prev => ({
            ...prev,
            bundling_events: bData.bundling_events
          }));
        }
      }).catch(err => {
        console.error("fetchBundling background failed:", err);
      });
      
    } catch (err) {
      setStatus(`Error`);
      setErrorMsg(err.message || "Failed to load graph.");
    } finally {
      setLoading(false);
    }
  }, [clearSelection]);

  const handleGoHome = () => {
    setRawGraphRes(null);
    setSearchedAddress("");
    clearSelection();
  };

  useEffect(() => {
    if (!rawGraphRes) return;

    setStatus("Building layout…");

    let rawNodes = [...rawGraphRes.nodes];
    let rawEdges = [...rawGraphRes.edges];
    let rawComms = rawGraphRes.communities;
    let bundling_events = rawGraphRes.bundling_events || [];
    
    // Inject Airdrops and Bundles into the standard graph
    if (bundling_events.length > 0) {
      // Limit to 5 bundles max (earliest ones)
      let eventsToProcess = [...bundling_events];
      const airdrops = eventsToProcess.filter(e => e.type === "airdrop");
      const bundles = eventsToProcess.filter(e => e.type === "bundle");
      
      // Sort bundles by time (if available, else they are already sorted by the backend)
      const topBundles = bundles.slice(0, 5);
      eventsToProcess = [...airdrops, ...topBundles];
      
      eventsToProcess.forEach(ev => {
        const cluster_id = ev.cluster_id;
        const ctype = ev.type || "cluster";
        const wallet_count = ev.wallet_count || 0;
        
        // Add the Hub node
        rawNodes.push({
          id: cluster_id,
          wallet: cluster_id,
          type: ctype,
          wallet_type: ctype, // for graphBuilder to identify
          label: ctype === "airdrop" ? "Airdrop Hub" : "Bundle Hub",
          name: ctype === "airdrop" ? "Airdrop" : "Bundle",
          balance: "0",
          balance_pct: 0, // Will be styled independently
          pagerank: 0,
          degree: wallet_count,
          in_degree: 0,
          out_degree: wallet_count,
          community_id: "N/A",
          total_volume_in: "0",
          total_volume_out: String(ev.total_volume || 0),
          unique_wallets_in: 0,
          unique_wallets_out: wallet_count,
          total_txs_received: 0,
          total_txs_made: wallet_count,
          original_wallet_count: wallet_count // store this so InfoPanel can show the true size
        });

        const wallets = Object.entries(ev.bundler_amounts || {});
        // Limit to 20 wallets per event
        const limitedWallets = wallets.slice(0, 20);

        limitedWallets.forEach(([wallet, amt]) => {
          const wallet_node_id = `${cluster_id}-${wallet}`;
          rawNodes.push({
            id: wallet_node_id,
            wallet: wallet,
            type: "wallet",
            wallet_type: "recipient",
            parentType: ctype,
            balance: "0",
            balance_pct: 0,
            pagerank: 0,
            degree: 1,
            in_degree: 1,
            out_degree: 0,
            community_id: "N/A",
            total_volume_in: String(amt),
            total_volume_out: "0",
            unique_wallets_in: 1,
            unique_wallets_out: 0,
            total_txs_received: 1,
            total_txs_made: 0
          });
          rawEdges.push({
            source: cluster_id,
            target: wallet_node_id,
            transfer_count: 1,
            total_volume: String(amt),
            bidirectional: false
          });
        });
      });
    }

    // Dynamically filter magic nodes out if the toggle is OFF
    if (!magicNodes) {
      rawNodes = rawNodes.filter(n => n.wallet_type !== "magic");
    }

    const canvas = canvasRef.current;
    const W = (canvas && canvas.offsetWidth > 0) ? canvas.offsetWidth : window.innerWidth;
    const H = (canvas && canvas.offsetHeight > 0) ? canvas.offsetHeight : window.innerHeight - 150;

    const comms = buildCommunities(rawComms);

    // Build ALL nodes first so the AddressList receives them (with colors)
    // Pass existing canvasNodes to preserve physical coordinates when bundles are injected later
    const allCanvasNodes = buildNodes(rawNodes, rawComms, W, H, canvasNodesRef.current);

    // Now dynamically filter out explicitly hidden nodes just for the physics engine
    const displayNodes = allCanvasNodes.filter(n => !hiddenNodes.has(n.id));
    const validNodeIds = new Set(displayNodes.map(n => n.id));
    const displayEdges = rawEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

    const finalEdges = buildEdges(displayEdges, displayNodes);

    loadGraph(displayNodes, finalEdges);
    setCommunities(comms);
    setCanvasNodes(allCanvasNodes);
    canvasNodesRef.current = allCanvasNodes;
    setGraphMeta(rawGraphRes);

    setStatus(
      `${rawGraphRes.total_holders.toLocaleString()} holders · ` +
      `${rawEdges.length.toLocaleString()} edges · ` +
      `${rawComms.length} communities`
    );
  }, [rawGraphRes, magicNodes, hiddenNodes, loadGraph]);

  return (
    <div style={{
      width: "100%", height: "100dvh", minHeight: "100dvh",
      display: "flex", flexDirection: "column",
      background: "#0a0a14",
      overflow: "hidden", position: "relative",
      touchAction: "manipulation",
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; } 
        html { touch-action: manipulation; }
        canvas { touch-action: none; }
        @keyframes pulseAndSpin {
          0% { transform: scale(1) rotate(0deg); opacity: 0.8; }
          50% { transform: scale(1.4) rotate(180deg); opacity: 1; text-shadow: 0 0 20px #7f77dd; }
          100% { transform: scale(1) rotate(360deg); opacity: 0.8; }
        }
      `}</style>

      <TopBar
        hasData={!!searchedAddress}
        status={status}
        loading={loading}
        onSearch={handleSearch}
        onGoHome={handleGoHome}
        onFindWallet={selectNodeById}
        magicNodes={magicNodes}
        setMagicNodes={setMagicNodes}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {isSidebarOpen && (
          <TokenSidebar
            tokens={availableTokens}
            onSelectToken={handleSearch}
            selectedAddress={searchedAddress}
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative", overflow: "hidden" }}>



          {/* Global Landing Page when no data is searched yet */}
          {!rawGraphRes && !loading && !errorMsg && (
            <div style={{
              position: "absolute", inset: 0, top: 120, // push below topbar
              display: "flex", flexDirection: "column",
              alignItems: "center",
              zIndex: 50,
              fontFamily: "Inter, system-ui, sans-serif",
              color: "rgba(255,255,255,0.8)",
              textAlign: "center",
              padding: "4vh 20px 40px 20px",
              background: "radial-gradient(circle at center, rgba(127,119,221,0.08) 0%, transparent 60%)",
              overflowY: "auto"
            }}>
              <div style={{ fontSize: 80, color: "#7f77dd", marginBottom: 20, opacity: 0.9, textShadow: "0 0 30px rgba(127,119,221,0.4)" }}>
                ◈
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 700, color: "#fff", marginBottom: 16, letterSpacing: "-0.02em" }}>
                Token Intelligence Graph
              </h1>
              <p style={{ fontSize: 16, maxWidth: 540, lineHeight: 1.6, color: "rgba(255,255,255,0.6)", marginBottom: 40 }}>
                Enter an ERC-20 token address above to analyze its holder distribution, connection graph, and identify potential Sybil clusters.
              </p>

              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px 24px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", minWidth: 180 }}>
                  <div style={{ fontSize: 12, color: "#7f77dd", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Visualise</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)" }}>Interactive Wallet Graphs</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px 24px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", minWidth: 180 }}>
                  <div style={{ fontSize: 12, color: "#7f77dd", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Analyse</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)" }}>Holder Distribution & Whales</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "16px 24px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", minWidth: 180 }}>
                  <div style={{ fontSize: 12, color: "#7f77dd", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Investigate</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)" }}>Counterparty Forensics</div>
                </div>
              </div>

              {/* Token Discovery is now handled by the Sidebar */}
            </div>
          )}

          {/* Standard graph */}
          <div style={{ position: "relative", flex: 1, minHeight: 0, display: "block" }}>
            {rawGraphRes && (
              <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }} />
            )}

            {/* Mobile zoom controls — pinch works too, double-tap toggles, but these are discoverable */}
            {rawGraphRes && (
              <div style={{
                position: "absolute", bottom: 16, right: 16,
                display: "flex", flexDirection: "column", gap: 6,
                zIndex: 12,
              }}>
                <button onClick={zoomIn} title="Zoom in" aria-label="Zoom in" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(20,20,30,0.9)", backdropFilter: "blur(8px)", color: "#fff", fontSize: 20, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                <button onClick={zoomOut} title="Zoom out" aria-label="Zoom out" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(20,20,30,0.9)", backdropFilter: "blur(8px)", color: "#fff", fontSize: 20, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <button onClick={resetZoom} title="Reset view" aria-label="Reset view" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(20,20,30,0.9)", backdropFilter: "blur(8px)", color: "rgba(255,255,255,0.85)", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>◎</button>
              </div>
            )}

            {rawGraphRes && (
              <div style={{
                position: "absolute", top: 15, left: 15,
                background: "rgba(20,20,30,0.85)", backdropFilter: "blur(10px)",
                borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
                padding: "8px 12px", display: "flex", alignItems: "center", gap: 12,
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 10,
                fontFamily: "Inter, sans-serif"
              }}>
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: rawGraphRes.logo_url ? "transparent" : "linear-gradient(135deg, #7f77dd, #3b82f6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: "#fff",
                  overflow: "hidden"
                }}>
                  {rawGraphRes.logo_url ? (
                    <img src={rawGraphRes.logo_url} alt={rawGraphRes.token_symbol} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    rawGraphRes.token_symbol ? rawGraphRes.token_symbol.substring(0, 1).toUpperCase() : "?"
                  )}
                </div>

                {/* Token Info */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                    {rawGraphRes.token_symbol || "Unknown"}
                    <span style={{ fontSize: 10, padding: "2px 4px", background: "rgba(255,255,255,0.1)", borderRadius: 4, fontWeight: 500 }}>
                      {rawGraphRes.total_holders ? rawGraphRes.total_holders.toLocaleString() : 0} holders
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                    {rawGraphRes.token_name || rawGraphRes.token_address.substring(0, 6) + "..."}
                  </div>
                </div>

                <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }}></div>

                {/* Magic Nodes Toggle */}
                <label style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 11, color: "rgba(255,255,255,0.7)",
                  cursor: "pointer", background: "rgba(255,255,255,0.05)",
                  padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                  transition: "background 0.2s"
                }}
                  title="Show/hide known exchanges and smart contracts to reveal underlying organic connections"
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                >
                  <input
                    type="checkbox"
                    checked={magicNodes}
                    onChange={(e) => setMagicNodes(e.target.checked)}
                    disabled={loading}
                    style={{ accentColor: "#7f77dd", width: 14, height: 14, cursor: "pointer" }}
                  />
                  Magic Nodes
                  <span style={{ color: "#7f77dd", fontWeight: 700 }}>{rawGraphRes.magic_node_count || 0}</span>
                </label>
              </div>
            )}

            {loading && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                background: "rgba(10, 10, 20, 0.6)",
                backdropFilter: "blur(6px)",
                zIndex: 100,
                fontFamily: "monospace",
                gap: 20
              }}>
                <div style={{
                  fontSize: 72,
                  color: "#7f77dd",
                  animation: "pulseAndSpin 2s infinite ease-in-out"
                }}>◈</div>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.2em", color: "rgba(255,255,255,0.9)" }}>
                  ANALYZING TOKEN...
                </div>
              </div>
            )}

            {errorMsg && !loading && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                background: "rgba(10, 10, 20, 0.8)",
                zIndex: 90,
              }}>
                <div style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  padding: "20px 40px",
                  borderRadius: "8px",
                  textAlign: "center"
                }}>
                  <div style={{ color: "#ef4444", fontSize: 24, marginBottom: 8 }}>⚠️ Query Failed</div>
                  <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, fontFamily: "monospace" }}>{errorMsg}</div>
                </div>
              </div>
            )}
            <InfoPanel
              node={selectedNode}
              communities={communities}
              onClose={clearSelection}
              hiddenNodes={hiddenNodes}
              onToggleVisibility={toggleNodeVisibility}
              tokenAddress={rawGraphRes?.token_address}
              chain={rawGraphRes?.chain}
            />

            {rawGraphRes && (
              <AddressList
                nodes={canvasNodes}
                hiddenNodes={hiddenNodes}
                onToggleVisibility={toggleNodeVisibility}
                magicNodesEnabled={magicNodes}
              />
            )}

          </div> {/* Close Standard Graph flex */}

        </div> {/* Close main column flex */}
      </div> {/* Close row flex container */}

      <StatsBar distribution={distribution} graph={graphMeta} communities={communities} />
    </div>
  );
}
