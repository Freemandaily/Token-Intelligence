import { useState, useMemo } from "react";

export default function AddressList({ nodes, hiddenNodes, onToggleVisibility, magicNodesEnabled }) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  // Filter and sort the nodes to display
  const displayNodes = useMemo(() => {
    if (!nodes) return [];
    
    let filtered = [...nodes];
    
    // If magic nodes toggle is off, don't show magic nodes in the list
    if (!magicNodesEnabled) {
      filtered = filtered.filter(n => n.wallet_type !== "magic");
    }

    // Apply local search filter
    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(n => n.id.toLowerCase().includes(s) || (n.name && n.name.toLowerCase().includes(s)));
    }

    // Sort by balance descending, but put magic nodes at the top or bottom?
    // Let's sort by balance_pct descending
    return filtered.sort((a, b) => b.balance_pct - a.balance_pct);
  }, [nodes, search, magicNodesEnabled]);

  if (!nodes || nodes.length === 0) return null;

  return (
    <div style={{
      position: "absolute",
      top: 55, // just below the TopBar
      right: 15,
      width: 320,
      maxHeight: "calc(100vh - 120px)",
      background: "rgba(15, 15, 25, 0.85)",
      backdropFilter: "blur(12px)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      borderRadius: 8,
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
      fontFamily: "monospace",
      overflow: "hidden",
      zIndex: 10,
    }}>
      {/* Header */}
      <div 
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(255, 255, 255, 0.02)",
          cursor: "pointer",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255, 255, 255, 0.9)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>{isOpen ? "▼" : "◀"}</span>
          <span>GRAPH ADDRESSES</span>
          <span style={{ 
            background: "rgba(127,119,221,0.2)", color: "#7f77dd", 
            padding: "2px 6px", borderRadius: 10, fontSize: 10 
          }}>
            {displayNodes.length}
          </span>
        </div>
      </div>

      {isOpen && (
        <>
          {/* Search Bar */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <input
              type="text"
              placeholder="Search address..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "6px 10px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4, color: "rgba(255,255,255,0.8)",
                fontSize: 11, fontFamily: "monospace", outline: "none"
              }}
            />
          </div>

          {/* List Content */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {displayNodes.map((node, index) => {
              const isHidden = hiddenNodes.has(node.id);
              
              let typeColor = "rgba(255,255,255,0.4)";
              if (node.wallet_type === "magic") typeColor = "#ff7be3"; // bright pink for magic
              else if (node.wallet_type === "exchange") typeColor = "#ff8c42"; // orange
              else if (node.wallet_type === "whale") typeColor = "#7f77dd"; // purple

              return (
                <div 
                  key={node.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.15)",
                    opacity: isHidden ? 0.4 : 1,
                    transition: "opacity 0.2s"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.4)", marginRight: 8, minWidth: 35 }}>
                      No {index + 1}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: node.color || "white", flexShrink: 0 }}></div>
                        <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.8)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", display: "flex", gap: "6px" }}>
                          {node.name && <span style={{ fontWeight: 600, color: "white" }}>{node.name}</span>}
                          <span>{node.name ? `(${node.id.slice(0,6)}...${node.id.slice(-4)})` : node.id}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {node.wallet_type === "magic" && (
                        <span style={{ 
                          fontSize: 9, color: typeColor, 
                          border: `1px solid ${typeColor}40`, 
                          padding: "1px 4px", borderRadius: 3,
                          textTransform: "uppercase"
                        }}>
                          {node.wallet_type}
                        </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onToggleVisibility(node.id)}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      color: isHidden ? "rgba(255,255,255,0.2)" : "rgba(127,119,221,0.8)",
                      fontSize: 16, padding: 4, display: "flex", alignItems: "center", justifyContent: "center"
                    }}
                    title={isHidden ? "Show Node" : "Hide Node"}
                  >
                    {isHidden ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
            
            {displayNodes.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                No addresses found.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
