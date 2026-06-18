/**
 * components/Legend.jsx
 * ---------------------
 * Community colour legend. Built from the backend communities array:
 *   { community_id, wallet_count, balance_pct, label }
 * Label values from backend: "whale" | "exchange" | "retail"
 */

export default function Legend({ communities }) {
  if (!communities.length) return null;

  return (
    <div style={{
      display: "flex", gap: 16, flexWrap: "wrap",
      padding: "6px 14px",
      borderBottom: "0.5px solid rgba(255,255,255,0.06)",
      background: "#0d0d18",
      fontSize: 10, fontFamily: "monospace",
      maxHeight: "60px",
      overflowY: "auto",
    }}>
      {communities.slice(0, 15).map((c) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.4)" }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: c.color, flexShrink: 0,
            boxShadow: `0 0 5px ${c.color}88`,
          }} />
          <span style={{ color: c.color, fontWeight: 600 }}>{c.label}</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>
            {c.wallets}w · {c.balance_pct?.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
