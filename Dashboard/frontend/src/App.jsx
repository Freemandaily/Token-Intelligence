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

import { useGraph } from "./hooks/useGraph.js";
import { fetchGraph, fetchDistribution } from "./services/api.js";
import { buildNodes, buildEdges, buildCommunities } from "./utils/graphBuilder.js";

export default function App() {
  const canvasRef = useRef(null);
  const { loadGraph, selectedNode, clearSelection, selectNodeById } = useGraph(canvasRef);

  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [distribution, setDistribution] = useState(null);
  const [graphMeta, setGraphMeta] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [magicNodes, setMagicNodes] = useState(false);
  const [rawGraphRes, setRawGraphRes] = useState(null);
  const [hiddenNodes, setHiddenNodes] = useState(new Set());
  const [canvasNodes, setCanvasNodes] = useState([]);

  const [errorMsg, setErrorMsg] = useState(null);

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

    try {
      const graphRes = await fetchGraph(tokenAddress);
      setRawGraphRes(graphRes);
      
      setStatus(
        `${graphRes.total_holders.toLocaleString()} holders · ` +
        `${graphRes.total_edges.toLocaleString()} edges · ` +
        `${graphRes.communities.length} communities`
      );
    } catch (err) {
      setStatus(`Error`);
      setErrorMsg(err.message || "Failed to load graph.");
    } finally {
      setLoading(false);
    }
  }, [clearSelection]);

  const handleGoHome = () => {
    setRawGraphRes(null);
    clearSelection();
  };

  useEffect(() => {
    if (!rawGraphRes) return;
    
    setStatus("Building layout…");
    
    let { nodes: rawNodes, edges: rawEdges, communities: rawComms } = rawGraphRes;
    
    // Dynamically filter magic nodes out if the toggle is OFF
    if (!magicNodes) {
      rawNodes = rawNodes.filter(n => n.wallet_type !== "magic");
    }

    const canvas = canvasRef.current;
    const W = (canvas && canvas.offsetWidth > 0) ? canvas.offsetWidth : window.innerWidth;
    const H = (canvas && canvas.offsetHeight > 0) ? canvas.offsetHeight : window.innerHeight - 150;

    const comms = buildCommunities(rawComms);
    
    // Build ALL nodes first so the AddressList receives them (with colors)
    const allCanvasNodes = buildNodes(rawNodes, rawComms, W, H);
    
    // Now dynamically filter out explicitly hidden nodes just for the physics engine
    const displayNodes = allCanvasNodes.filter(n => !hiddenNodes.has(n.id));
    const validNodeIds = new Set(displayNodes.map(n => n.id));
    const displayEdges = rawEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

    const finalEdges = buildEdges(displayEdges, displayNodes);

    loadGraph(displayNodes, finalEdges);
    setCommunities(comms);
    setCanvasNodes(allCanvasNodes);
    setGraphMeta(rawGraphRes);
    
    setStatus(
      `${rawGraphRes.total_holders.toLocaleString()} holders · ` +
      `${rawEdges.length.toLocaleString()} edges · ` +
      `${rawComms.length} communities`
    );
  }, [rawGraphRes, magicNodes, hiddenNodes, loadGraph]);

  return (
    <div style={{
      width: "100vw", height: "100vh",
      display: "flex", flexDirection: "column",
      background: "#0a0a14",
      overflow: "hidden", position: "fixed", top: 0, left: 0,
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; } 
        body, html { overflow: hidden; user-select: none; }
        @keyframes pulseAndSpin {
          0% { transform: scale(1) rotate(0deg); opacity: 0.8; }
          50% { transform: scale(1.4) rotate(180deg); opacity: 1; text-shadow: 0 0 20px #7f77dd; }
          100% { transform: scale(1) rotate(360deg); opacity: 0.8; }
        }
      `}</style>

      <TopBar 
        hasData={!!rawGraphRes}
        status={status} 
        loading={loading} 
        onSearch={handleSearch} 
        onGoHome={handleGoHome}
        onFindWallet={selectNodeById} 
        magicNodes={magicNodes}
        setMagicNodes={setMagicNodes}
      />

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {rawGraphRes && (
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
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
              background: "linear-gradient(135deg, #7f77dd, #3b82f6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: "#fff"
            }}>
              {rawGraphRes.token_symbol ? rawGraphRes.token_symbol.substring(0, 1).toUpperCase() : "?"}
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
                {rawGraphRes.token_name || rawGraphRes.token_address.substring(0,6)+"..."}
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
        )} {!rawGraphRes && !loading && !errorMsg && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center",
            zIndex: 50,
            fontFamily: "Inter, system-ui, sans-serif",
            color: "rgba(255,255,255,0.8)",
            textAlign: "center",
            padding: "12vh 20px 40px 20px",
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

            {/* Token Discovery Cards */}
            <TokenDiscovery onSelectToken={handleSearch} />
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
        />
        
        {rawGraphRes && (
          <AddressList 
            nodes={canvasNodes} 
            hiddenNodes={hiddenNodes} 
            onToggleVisibility={toggleNodeVisibility} 
            magicNodesEnabled={magicNodes}
          />
        )}

      </div>

      <StatsBar distribution={distribution} graph={graphMeta} communities={communities} />
    </div>
  );
}
