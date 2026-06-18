/**
 * components/TopBar.jsx
 * ---------------------
 * Token address search input + status strip.
 * On submit → calls onSearch(tokenAddress).
 */

import { useState, useEffect } from "react";
import { fetchAvailableTokens } from "../services/api";

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

export default function TopBar({ status, loading, onSearch, onGoHome, hasData }) {
  const [input, setInput] = useState("");
  const [tokens, setTokens] = useState([]);

  useEffect(() => {
    fetchAvailableTokens().then(data => setTokens(data)).catch(console.error);
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const addr = input.trim();
    if (addr) onSearch(addr);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "28px 24px 20px 24px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      background: "#0a0a14", fontFamily: "Inter, sans-serif",
      position: "relative", zIndex: 100,
    }}>
      {/* title - absolute positioned to stay on the left without affecting centering of search bar */}
      <div 
        onClick={onGoHome}
        style={{ 
          position: "absolute", left: 24, display: "flex", flexDirection: "column", 
          cursor: "pointer", transition: "opacity 0.2s" 
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = 0.8}
        onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#7f77dd", fontSize: 20 }}>◈</span> Token Intelligence
        </div>
      </div>

      {/* search token - Centered or Left Aligned */}
      <div style={{ 
        display: "flex", 
        justifyContent: hasData ? "flex-start" : "center", 
        flex: 1,
        paddingLeft: hasData ? 220 : 0,
        transition: "all 0.3s ease"
      }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 480, display: "flex", justifyContent: "flex-start" }}>
          {/* Glowing Aura */}
          <div style={{
            position: "absolute",
            inset: -3,
            background: "linear-gradient(90deg, rgba(236,72,153,0.5) 0%, rgba(139,92,246,0.5) 50%, rgba(59,130,246,0.5) 100%)",
            filter: "blur(14px)",
            borderRadius: "50px",
            zIndex: 0,
            opacity: 0.7,
          }}></div>

          <form onSubmit={handleSubmit} style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            background: "#e2e8f0", // light pill background
            borderRadius: 50,
            padding: "3px 4px 3px 16px",
            width: "100%",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)"
          }}>
            <div style={{ color: "#64748b", display: "flex", alignItems: "center", transform: "scale(0.85)" }}>
              <SearchIcon />
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search Token Address (0x...)"
              disabled={loading}
              style={{
                flex: 1,
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: "#0f172a",
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "8px 10px",
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 20px",
                background: loading ? "#94a3b8" : "#1e293b",
                border: "none",
                borderRadius: 30,
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.2s"
              }}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>
        </div>
      </div>

      {/* Right side - Moving Token Ticker */}
      {hasData && tokens.length > 0 && (
        <div style={{ 
          position: "absolute", right: 24, 
          width: "45%", overflow: "hidden", 
          maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)"
        }}>
          <div style={{ display: "flex", width: "max-content", animation: "marquee 40s linear infinite" }}>
            {[...tokens, ...tokens, ...tokens, ...tokens].map((t, idx) => (
              <div 
                key={idx} 
                onClick={() => onSearch(t.token_address)}
                style={{ 
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 12px", background: "rgba(255,255,255,0.05)",
                  borderRadius: 20, margin: "0 8px", cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.05)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(127,119,221,0.2)";
                  e.currentTarget.style.borderColor = "rgba(127,119,221,0.5)";
                  e.currentTarget.parentElement.style.animationPlayState = "paused";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                  e.currentTarget.parentElement.style.animationPlayState = "running";
                }}
              >
                <div style={{ 
                  width: 18, height: 18, borderRadius: "50%", 
                  background: "linear-gradient(135deg, #7f77dd, #3b82f6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#fff"
                }}>
                  {t.symbol ? t.symbol.substring(0, 1).toUpperCase() : "?"}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{t.symbol || "Token"}</span>
              </div>
            ))}
          </div>
          <style>{`
            @keyframes marquee {
              0% { transform: translateX(0%); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
