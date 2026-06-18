import { useEffect, useState } from "react";
import { fetchAvailableTokens } from "../services/api";

export default function TokenDiscovery({ onSelectToken }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchAvailableTokens().then(data => {
      if (mounted) {
        setTokens(data);
        setLoading(false);
      }
    }).catch(err => {
      console.error("Failed to fetch available tokens", err);
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  if (loading || tokens.length === 0) return null;

  return (
    <div style={{ marginTop: 60, width: "100%", maxWidth: 800, textAlign: "left" }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>Available Tokens</span>
      </div>
      
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", 
        gap: 16 
      }}>
        {tokens.map((t, idx) => (
          <div 
            key={idx}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (typeof onSelectToken === "function") {
                onSelectToken(t.token_address);
              } else {
                alert("Error: The select handler is not connected. Please refresh the page.");
              }
            }}
            style={{ 
              background: "rgba(255,255,255,0.03)", 
              border: "1px solid rgba(255,255,255,0.08)", 
              borderRadius: 12, 
              padding: "16px",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 12
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(127,119,221,0.1)";
              e.currentTarget.style.borderColor = "rgba(127,119,221,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            }}
          >
            <div style={{ 
              width: 40, height: 40, borderRadius: "50%", 
              background: "linear-gradient(135deg, #7f77dd, #3b82f6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, color: "#fff"
            }}>
              {t.symbol ? t.symbol.substring(0, 1).toUpperCase() : "?"}
            </div>
            
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.name || t.symbol || "Unknown Token"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#7f77dd", fontWeight: 600 }}>{t.symbol}</span>
                <span>•</span>
                <span>{t.token_address.substring(0, 6)}...{t.token_address.substring(t.token_address.length - 4)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
