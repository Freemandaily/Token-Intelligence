import { useState } from "react";

const CHAIN_LOGOS = {
  ethereum: "https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=029",
  arbitrum: "https://cryptologos.cc/logos/arbitrum-arb-logo.svg?v=029",
  base: "https://avatars.githubusercontent.com/u/108554348?s=200&v=4",
  optimism: "https://cryptologos.cc/logos/optimism-ethereum-op-logo.svg?v=029",
  bsc: "https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=029",
  binance: "https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=029",
  bnb: "https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=029",
};

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export default function TokenSidebar({ tokens, onSelectToken, selectedAddress }) {
  // Group tokens by chain
  const tokensByChain = tokens.reduce((acc, t) => {
    const chainName = t.chain || "Unknown Chain";
    if (!acc[chainName]) acc[chainName] = [];
    acc[chainName].push(t);
    return acc;
  }, {});

  // State to track expanded chains
  // Default to expanding all chains if there are only a few, else just the first one
  const initialExpanded = Object.keys(tokensByChain).reduce((acc, chain) => {
    acc[chain] = true; // Auto-expand all by default
    return acc;
  }, {});

  const [expandedChains, setExpandedChains] = useState(initialExpanded);
  const [copiedToken, setCopiedToken] = useState(null);

  const toggleChain = (chainName) => {
    setExpandedChains(prev => ({
      ...prev,
      [chainName]: !prev[chainName]
    }));
  };

  const handleCopy = (e, tokenAddress) => {
    e.stopPropagation();
    navigator.clipboard.writeText(tokenAddress);
    setCopiedToken(tokenAddress);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  return (
    <div style={{
      width: 280,
      height: "100%",
      background: "rgba(10,10,20,0.98)",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      fontFamily: "Inter, sans-serif",
      flexShrink: 0
    }}>
      <div style={{
        padding: "20px 20px 16px",
        fontSize: 13,
        fontWeight: 600,
        color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: "1px solid rgba(255,255,255,0.03)"
      }}>
        Token Chain
      </div>

      <div style={{ padding: "12px 12px" }}>
        {Object.entries(tokensByChain).map(([chain, chainTokens]) => {
          const isExpanded = expandedChains[chain];
          const chainLogo = CHAIN_LOGOS[chain.toLowerCase()];

          return (
            <div key={chain} style={{ marginBottom: 8 }}>
              {/* Chain Header (Accordion Toggle) */}
              <div 
                onClick={() => toggleChain(chain)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 8,
                  cursor: "pointer",
                  userSelect: "none",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ 
                    width: 20, height: 20, borderRadius: "50%", 
                    background: chainLogo ? "transparent" : "rgba(127,119,221,0.2)", 
                    color: "#7f77dd",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: "bold",
                    overflow: "hidden"
                  }}>
                    {chainLogo ? (
                      <img src={chainLogo} alt={chain} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    ) : (
                      chain.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.9)", textTransform: "capitalize" }}>
                    {chain}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 10 }}>
                    {chainTokens.length}
                  </span>
                </div>
                <div style={{ 
                  color: "rgba(255,255,255,0.3)", 
                  transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                  fontSize: 18,
                  lineHeight: 1
                }}>
                  ›
                </div>
              </div>

              {/* Token List for this Chain */}
              {isExpanded && (
                <div style={{ 
                  marginTop: 4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  paddingLeft: 12
                }}>
                  {chainTokens.map(t => {
                    const isSelected = selectedAddress?.toLowerCase() === t.token_address.toLowerCase();
                    return (
                      <div 
                        key={t.token_address}
                        onClick={() => onSelectToken(t.token_address)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          background: isSelected ? "rgba(127,119,221,0.15)" : "transparent",
                          border: isSelected ? "1px solid rgba(127,119,221,0.3)" : "1px solid transparent",
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = "transparent";
                          }
                        }}
                      >
                        <div style={{ 
                          width: 20, height: 20, borderRadius: "50%", 
                          background: t.logo_url ? "transparent" : "linear-gradient(135deg, #7f77dd, #3b82f6)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: "#fff",
                          flexShrink: 0,
                          overflow: "hidden"
                        }}>
                          {t.logo_url ? (
                            <img src={t.logo_url} alt={t.symbol} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          ) : (
                            t.symbol ? t.symbol.substring(0, 1).toUpperCase() : "?"
                          )}
                        </div>
                        <div style={{ overflow: "hidden", flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: isSelected ? "#fff" : "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {t.name || t.symbol || "Unknown"}
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                            {t.symbol}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleCopy(e, t.token_address)}
                          title="Copy Token Address"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: copiedToken === t.token_address ? "#22c55e" : "rgba(255,255,255,0.3)",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 4,
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            if (copiedToken !== t.token_address) {
                              e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (copiedToken !== t.token_address) {
                              e.currentTarget.style.color = "rgba(255,255,255,0.3)";
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                        >
                          {copiedToken === t.token_address ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          ) : (
                            <CopyIcon />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {tokens.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No tokens available
          </div>
        )}
      </div>
    </div>
  );
}
