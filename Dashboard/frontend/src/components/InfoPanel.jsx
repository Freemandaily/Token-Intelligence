import { useState } from "react";

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15 3 21 3 21 9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const EyeOpenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeClosedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

const ArrowInIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" />
    <path d="M16 8l-8 8" />
    <path d="M8 8v8h8" />
  </svg>
);

const ArrowOutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" />
    <path d="M8 16l8-8" />
    <path d="M16 16V8H8" />
  </svg>
);

export default function InfoPanel({ node, communities, onClose, hiddenNodes, onToggleVisibility, tokenAddress }) {
  const [copied, setCopied] = useState(false);
  if (!node) return null;

  const isHidden = hiddenNodes?.has(node.id);
  const comm = communities?.find((c) => c.id === node.community_id);
  const color = node.color || comm?.color || "#ffffff";
  const shortId = `${node.id.slice(0, 6)}...${node.id.slice(-4)}`;

  function copy(text) {
    navigator.clipboard.writeText(text)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      });
  }

  // Formatters
  const formatAmount = (val) => {
    const num = Number(val || 0);
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const balancePct = node.balance_pct < 0.0001 ? "< 0.01" : (node.balance_pct * 100).toFixed(2);

  return (
    <div className="info-panel" style={{
      position: "absolute", top: 110, left: 15,
      background: "#161622",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: 16, width: 340,
      fontFamily: "Inter, system-ui, sans-serif",
      boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
      color: "#ffffff"
    }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 8px ${color}` }}></div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 18, fontWeight: 600, fontFamily: node.name ? "inherit" : "monospace", lineHeight: 1.2 }}>{node.name || shortId}</span>
            {node.name && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "monospace", marginTop: 2 }}>{shortId}</span>}
          </div>
          <button onClick={() => copy(node.id)} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#22c55e" : "rgba(255,255,255,0.5)", marginTop: 2, alignSelf: "flex-start" }} title="Copy Address">
            <CopyIcon />
          </button>
          {tokenAddress && (
            <a 
              href={`https://etherscan.io/token/${tokenAddress}?a=${node.id}`} 
              target="_blank" 
              rel="noreferrer"
              style={{ color: "rgba(255,255,255,0.5)", marginTop: 2, display: "flex", alignItems: "center" }}
              title="View on Etherscan"
            >
              <ExternalLinkIcon />
            </a>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, color: "rgba(255,255,255,0.6)" }}>
          <button onClick={() => onToggleVisibility && onToggleVisibility(node.id)} style={{ background: "none", border: "none", cursor: "pointer", color: isHidden ? "#22c55e" : "inherit" }} title={isHidden ? "Show Node" : "Hide Node"}>
            {isHidden ? <EyeClosedIcon /> : <EyeOpenIcon />}
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
            <CloseIcon />
          </button>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 16 }}></div>

      {/* 2-COLUMN STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{balancePct}%</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Of Supply</div>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{formatAmount(node.balance)}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Amount</div>
        </div>
      </div>

      {/* CLUSTER PILL */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "10px 14px", marginBottom: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Community {node.community_id} Node</span>
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }}></div>
      </div>

      {/* IN / OUT ROWS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* IN Row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ArrowInIcon />
          <div style={{ fontSize: 15 }}>
            <span style={{ fontWeight: 700 }}>{formatAmount(node.total_volume_in)} IN</span>
            <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 6 }}>from {node.unique_wallets_in || 0} addresses</span>
          </div>
        </div>
        {/* OUT Row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ArrowOutIcon />
          <div style={{ fontSize: 15 }}>
            <span style={{ fontWeight: 700 }}>{formatAmount(node.total_volume_out)} OUT</span>
            <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 6 }}>to {node.unique_wallets_out || 0} addresses</span>
          </div>
        </div>
      </div>
    </div>
  );
}
