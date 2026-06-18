/**
 * components/StatsBar.jsx
 * -----------------------
 * Bottom HUD. Reads from the backend DistributionResponse:
 *   { token_address, total_supply, holder_count,
 *     concentration: { gini, hhi, top_10_pct, top_50_pct, score } }
 * Plus graph-level totals from GraphResponse.
 */

const SCORE_COLOR = {
  highly_concentrated: "#e24b4a",
  concentrated:        "#ffb347",
  moderate:            "#7f77dd",
  healthy:             "#1d9e75",
};

export default function StatsBar({ distribution, graph, communities }) {
  const c = distribution?.concentration;

  const pills = distribution ? [
    ["Holders",      distribution.holder_count?.toLocaleString()],
    ["Supply",       Number(distribution.total_supply).toLocaleString(undefined, { maximumFractionDigits: 0 })],
    ["Gini",         c?.gini?.toFixed(4)],
    ["HHI",          c?.hhi?.toFixed(4)],
    ["Top-10",       c?.top_10_pct != null ? c.top_10_pct.toFixed(2) + "%" : "—"],
    ["Top-50",       c?.top_50_pct != null ? c.top_50_pct.toFixed(2) + "%" : "—"],
    ["Edges",        graph?.total_edges?.toLocaleString()],
    ["Communities",  communities.length || "—"],
  ] : [];

  const score = c?.score;

  return (
    <div style={{
      display: "flex", gap: 6, padding: "7px 14px",
      borderTop: "0.5px solid rgba(255,255,255,0.06)",
      background: "#0d0d18", flexWrap: "wrap", alignItems: "center",
    }}>
      {/* concentration score badge */}
      {score && (
        <div style={{
          fontSize: 10, fontFamily: "monospace", fontWeight: 600,
          padding: "3px 10px", borderRadius: 4, marginRight: 4,
          background: (SCORE_COLOR[score] ?? "#888") + "22",
          color: SCORE_COLOR[score] ?? "#888",
          border: `0.5px solid ${SCORE_COLOR[score] ?? "#888"}44`,
          letterSpacing: "0.04em",
        }}>
          {score.replace(/_/g, " ").toUpperCase()}
        </div>
      )}

      {pills.map(([label, value]) => (
        <div key={label} style={{
          fontSize: 10, fontFamily: "monospace",
          color: "rgba(255,255,255,0.35)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 4, padding: "3px 10px",
        }}>
          {label}{" "}
          <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
            {value ?? "—"}
          </span>
        </div>
      ))}

      {!distribution && (
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>
          Enter a token address to begin
        </span>
      )}
    </div>
  );
}
