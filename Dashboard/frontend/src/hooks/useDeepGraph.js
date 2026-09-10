/**
 * hooks/useDeepGraph.js
 * ---------------------
 * D3 force-simulation canvas renderer for the deep network analysis.
 * Follows the same pattern as useForensicGraph.js but encodes:
 *   - Node SIZE  → betweenness centrality (hubs are larger circles)
 *   - Node COLOR → community_id (each cluster gets a unique palette color)
 *   - Node RING  → wallet_type / flags (hub=orange, wash=red, circular=amber)
 *   - Edge STYLE → bidirectional edges drawn in purple; directional in dim white
 */

import { useEffect, useRef } from "react";
import * as d3 from "d3";

// Palette for up to 20 communities
const COMMUNITY_COLORS = [
  "#7f77dd","#3b82f6","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#84cc16","#f97316","#ec4899",
  "#14b8a6","#a855f7","#22c55e","#eab308","#6366f1",
  "#0ea5e9","#d946ef","#fb923c","#4ade80","#facc15",
];

const FLAG_COLORS = {
  wash_trade:       "#ef4444",
  hub_and_spoke:    "#f97316",
  circular_flow:    "#f59e0b",
  high_betweenness: "#a855f7",
};

function nodeRadius(node) {
  const base = 10;
  const bt = node.betweenness || 0;
  // Scale: 0 betweenness → r=10, 0.1 betweenness → r=28
  return Math.min(base + bt * 180, 36);
}

function nodeColor(node, communityColors) {
  if (node.community_id >= 0) return communityColors[node.community_id % communityColors.length];
  if (node.parentType === "airdrop") return "#0ea5e9";
  if (node.parentType === "bundle" || node.parentType === "cluster") return "#f59e0b";
  return "#888780"; // Match standard graph default
}

export default function useDeepGraph(canvasRef, data, onNodeClick) {
  const S = useRef({ transform: d3.zoomIdentity, hovered: null, sim: null, draggedNode: null });

  useEffect(() => {
    if (!canvasRef.current || !data || !data.nodes) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    
    // Set initial size
    canvas.width = W;
    canvas.height = H;

    const resize = () => {
      if (!canvasRef.current) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      if (S.current.sim) {
        S.current.sim.force("x", d3.forceX(canvas.width / 2).strength(0.02));
        S.current.sim.force("y", d3.forceY(canvas.height / 2).strength(0.02));
        S.current.sim.alpha(0.3).restart();
      }
      requestAnimationFrame(draw);
    };
    
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // Build node/edge maps
    const nodeMap = new Map(data.nodes.map(n => [n.id, { ...n }]));
    const nodes = [...nodeMap.values()];
    const edges = data.edges
      .map(e => ({
        ...e,
        source: nodeMap.get(e.source) || e.source,
        target: nodeMap.get(e.target) || e.target,
      }))
      .filter(e => typeof e.source === "object" && typeof e.target === "object");

    if (S.current.sim) S.current.sim.stop();

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id(d => d.id).distance(d => (d.source.type === "cluster" || d.source.type === "bundle" || d.source.type === "airdrop") ? 40 : 80).strength(0.8))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("x", d3.forceX(W / 2).strength(0.1))
      .force("y", d3.forceY(H / 2).strength(0.1))
      .force("collide", d3.forceCollide().radius(d => nodeRadius(d) + 8))
      .alpha(1)
      .on("tick", draw);

    S.current.sim = sim;

    function draw() {
      if (!canvasRef.current) return;
      const { transform, hovered } = S.current;

      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Draw subtle grid
      ctx.strokeStyle = "rgba(255,255,255,0.02)";
      ctx.lineWidth = 1 / transform.k;
      const gs = 80;
      const sx = -transform.x / transform.k, sy = -transform.y / transform.k;
      const ex = sx + canvas.width / transform.k, ey = sy + canvas.height / transform.k;
      ctx.beginPath();
      for (let x = Math.floor(sx/gs)*gs; x < ex; x+=gs) { ctx.moveTo(x, sy); ctx.lineTo(x, ey); }
      for (let y = Math.floor(sy/gs)*gs; y < ey; y+=gs) { ctx.moveTo(sx, y); ctx.lineTo(ex, y); }
      ctx.stroke();

      // Draw edges
      edges.forEach(e => {
        if (!e.source.x || !e.target.x) return;
        const isHov = hovered && (hovered === e.source || hovered === e.target);
        ctx.beginPath();
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);
        if (e.bidirectional) {
          ctx.strokeStyle = isHov ? "rgba(167,139,250,0.9)" : "rgba(167,139,250,0.25)";
        } else {
          ctx.strokeStyle = isHov ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)";
        }
        ctx.lineWidth = isHov ? 1.5 / transform.k : 0.8 / transform.k;
        ctx.stroke();

        // Arrowhead
        const dx = e.target.x - e.source.x;
        const dy = e.target.y - e.source.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len > 0) {
          const r = nodeRadius(e.target) + 3;
          const tx = e.target.x - (dx/len)*r;
          const ty = e.target.y - (dy/len)*r;
          const angle = Math.atan2(dy, dx);
          const alen = 6 / transform.k;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - alen*Math.cos(angle-0.4), ty - alen*Math.sin(angle-0.4));
          ctx.lineTo(tx - alen*Math.cos(angle+0.4), ty - alen*Math.sin(angle+0.4));
          ctx.closePath();
          ctx.fillStyle = e.bidirectional ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.2)";
          ctx.fill();
        }
      });

      // Draw nodes
      nodes.forEach(n => {
        if (!n.x) return;
        const r = nodeRadius(n);
        const isHov = hovered === n;
        const color = nodeColor(n, COMMUNITY_COLORS);
        
        let borderColor = "rgba(255,255,255,0.8)";
        if (n.type === "bundle" || n.type === "airdrop" || n.type === "cluster") {
          borderColor = n.type === "airdrop" ? "#0ea5e9" : "#f59e0b"; // Blue for airdrop, orange for bundle
        }

        // Glow for hubs
        if (n.type === "bundle" || n.type === "airdrop" || n.type === "cluster") {
          ctx.shadowColor = borderColor;
          ctx.shadowBlur = 20;
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
        
        if (n.type === "bundle" || n.type === "airdrop" || n.type === "cluster") {
          // Premium 3D glowing orb effect for hubs
          const rgb = n.type === "airdrop" ? "14, 165, 233" : "245, 158, 11";
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
          grad.addColorStop(0, `rgba(255, 255, 255, 0.9)`);
          grad.addColorStop(0.4, `rgba(${rgb}, 0.9)`);
          grad.addColorStop(1, `rgba(${rgb}, 0.4)`);
          ctx.fillStyle = grad;
        } else {
          // Standard graph styling: dark center fading to the community color
          const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
          gradient.addColorStop(0, "#111");
          gradient.addColorStop(1, isHov ? "#fff" : color);
          ctx.fillStyle = gradient;
        }
        ctx.fill();

        if (n.type === "bundle" || n.type === "airdrop" || n.type === "cluster") {
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = isHov ? 4 : 2.5;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
        } else {
          ctx.strokeStyle = color; // Use community color for standard border
          ctx.lineWidth = isHov ? 3 / transform.k : 1.5 / transform.k;
          if (r > 15) {
            ctx.setLineDash([4, 4]);
          } else {
            ctx.setLineDash([]);
          }
          ctx.stroke();
        }
        ctx.setLineDash([]); // Reset
        ctx.shadowBlur = 0; // Reset

        // Label (shown only when hovered)
        const isArtificialHub = n.type === "bundle" || n.type === "airdrop" || n.type === "cluster";
        const shouldShowLabel = isHov;

        if (shouldShowLabel) {
          const addr = n.actualAddress || String(n.id);
          let labelText = n.name || `${addr.slice(0,6)}…${addr.slice(-4)}`;
          if (isArtificialHub) {
            labelText = n.name || n.label || "Cluster";
          }
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${Math.max(9, 11 / transform.k)}px Inter, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, n.x, n.y - r - 8 / transform.k);
        }

        // Betweenness score badge on hover
        if (isHov && n.betweenness > 0) {
          const badge = `bt:${n.betweenness.toFixed(3)}`;
          ctx.font = `${9 / transform.k}px monospace`;
          ctx.fillStyle = "#a855f7";
          ctx.fillText(badge, n.x, n.y + r + 10 / transform.k);
        }
      });

      ctx.restore();
    }

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([0.05, 6])
      .filter(e => {
        if (e.type === "mousedown") {
          const rect = canvas.getBoundingClientRect();
          const x = (e.clientX - rect.left - S.current.transform.x) / S.current.transform.k;
          const y = (e.clientY - rect.top  - S.current.transform.y) / S.current.transform.k;
          for (const n of nodes) {
            if (!n.x) continue;
            const r = nodeRadius(n);
            if (Math.hypot(x - n.x, y - n.y) < r) return false;
          }
        }
        return !e.ctrlKey && !e.button;
      })
      .on("zoom", e => { S.current.transform = e.transform; requestAnimationFrame(draw); });
    d3.select(canvas).call(zoom);

    // Drag
    d3.select(canvas).call(
      d3.drag()
        .subject(e => {
          if (!e.sourceEvent) return null;
          const rect = canvas.getBoundingClientRect();
          const x = (e.sourceEvent.clientX - rect.left - S.current.transform.x) / S.current.transform.k;
          const y = (e.sourceEvent.clientY - rect.top  - S.current.transform.y) / S.current.transform.k;
          for (const n of [...nodes].reverse()) {
            if (!n.x) continue;
            if (Math.hypot(x - n.x, y - n.y) < nodeRadius(n)) return n;
          }
          return null;
        })
        .on("start", e => { 
          if (!e.active) sim.alphaTarget(0.3).restart();
          e.subject.fx = e.subject.x; 
          e.subject.fy = e.subject.y; 
          S.current.draggedNode = e.subject;
        })
        .on("drag",  e => { 
          e.subject.fx += e.dx / S.current.transform.k; 
          e.subject.fy += e.dy / S.current.transform.k; 
          e.subject.x = e.subject.fx;
          e.subject.y = e.subject.fy;
          requestAnimationFrame(draw); 
        })
        .on("end",   e => { 
          if (!e.active) sim.alphaTarget(0);
          sim.alpha(0.8).restart(); // Burst of energy so clustered wallets can arrange
          S.current.draggedNode = null;
        })
    );

    // Hover + click
    canvas.onmousemove = e => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - S.current.transform.x) / S.current.transform.k;
      const y = (e.clientY - rect.top  - S.current.transform.y) / S.current.transform.k;
      let found = null;
      for (const n of nodes) {
        if (!n.x) continue;
        if (Math.hypot(x - n.x, y - n.y) < nodeRadius(n) + 4) { found = n; break; }
      }
      if (S.current.hovered !== found) {
        S.current.hovered = found;
        canvas.style.cursor = found ? "pointer" : "default";
        requestAnimationFrame(draw);
      }
    };

    canvas.onclick = e => {
      if (S.current.hovered && onNodeClick) onNodeClick(S.current.hovered);
    };

    return () => {
      resizeObserver.disconnect();
      if (S.current.sim) S.current.sim.stop();
      canvas.onmousemove = null;
      canvas.onclick = null;
    };
  }, [data]);
}
