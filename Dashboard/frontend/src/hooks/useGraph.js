import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

export function useGraph(canvasRef) {
  const [selectedNode, setSelectedNode] = useState(null);

  const S = useRef({
    nodes: [],
    edges: [],
    degree: new Map(),
    hubLeaves: new Map(),
    selectedNode: null,
    connectedNodes: new Set(),
    animationFrame: null,
    transform: d3.zoomIdentity,
    width: 0,
    height: 0,
    hoveredNode: null
  });

  const loadGraph = useCallback((initialNodes, initialEdges) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });

    const parent = canvas.parentElement;
    let W = parent.clientWidth;
    let H = parent.clientHeight;
    canvas.width = W;
    canvas.height = H;
    S.current.width = W;
    S.current.height = H;

    const prevNodeMap = new Map((S.current.nodes || []).map(n => [n.id, n]));
    const isUpdate = prevNodeMap.size > 0;

    const nodes = initialNodes.map(n => {
      const prev = prevNodeMap.get(n.id);
      if (prev) {
        return { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy };
      }
      return n;
    });
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    const edges = initialEdges.map(e => ({
      ...e,
      source: typeof e.source === "number" ? nodes[e.source] : (typeof e.source === "string" ? nodeById.get(e.source) : e.source),
      target: typeof e.target === "number" ? nodes[e.target] : (typeof e.target === "string" ? nodeById.get(e.target) : e.target)
    })).filter(e => e.source && e.target);

    const degree = new Map();
    nodes.forEach(n => degree.set(n.id, 0));
    edges.forEach(e => {
      degree.set(e.source.id, degree.get(e.source.id) + 1);
      degree.set(e.target.id, degree.get(e.target.id) + 1);
    });

    // Scale node sizes
    const maxDegree = Math.max(...Array.from(degree.values()), 1);
    nodes.forEach(n => {
      const deg = degree.get(n.id);
      n.r = deg === 0 ? 3 : deg === 1 ? 5 : 8 + Math.sqrt(deg) * 3;
    });

    const hubLeaves = new Map();
    edges.forEach(e => {
      const sid = typeof e.source === "object" ? e.source.id : e.source;
      const tid = typeof e.target === "object" ? e.target.id : e.target;
      if (degree.get(sid) === 1 && degree.get(tid) > 1) {
        if (!hubLeaves.has(tid)) hubLeaves.set(tid, []);
        hubLeaves.get(tid).push(sid);
      }
      if (degree.get(tid) === 1 && degree.get(sid) > 1) {
        if (!hubLeaves.has(sid)) hubLeaves.set(sid, []);
        hubLeaves.get(sid).push(tid);
      }
    });

    const hubBackbone = new Map();
    edges.forEach(e => {
      const sid = typeof e.source === "object" ? e.source.id : e.source;
      const tid = typeof e.target === "object" ? e.target.id : e.target;
      if (degree.get(sid) > 1 && degree.get(tid) > 1) {
        if (!hubBackbone.has(sid)) hubBackbone.set(sid, []);
        hubBackbone.get(sid).push(tid);
        if (!hubBackbone.has(tid)) hubBackbone.set(tid, []);
        hubBackbone.get(tid).push(sid);
      }
    });
    S.current.nodes = nodes;
    S.current.edges = edges;
    S.current.degree = degree;
    S.current.hubLeaves = hubLeaves;

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).distance(80).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("collide", d3.forceCollide().radius(d => d.r + 8))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("unconnectedRing", d3.forceRadial(
        Math.max(300, Math.min(W, H) * 0.45),
        W / 2,
        H / 2
      ).strength(d => degree.get(d.id) === 0 ? 0.1 : 0))
      .force("hubAnchor", d3.forceRadial(
        Math.max(150, Math.min(W, H) * 0.25),
        W / 2,
        H / 2
      ).strength(d => (d.wallet_type === "airdrop" || d.wallet_type === "bundle") ? 0.1 : 0))
      .alpha(1)
      .on("tick", drawFrame);

    function drawFrame() {
      S.current.drawFrame = drawFrame;
      if (!canvasRef.current) return;

      const transform = S.current.transform;

      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Draw edges
      edges.forEach(e => {
        const isConnected = S.current.selectedNode &&
          (e.source === S.current.selectedNode || e.target === S.current.selectedNode);

        ctx.beginPath();
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);

        if (S.current.selectedNode && isConnected) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 2.0;
        } else {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.lineWidth = 1.0;
        }
        ctx.stroke();

        if (isConnected || !S.current.selectedNode) {
          // Draw arrowhead
          const dx = e.target.x - e.source.x;
          const dy = e.target.y - e.source.y;
          const angle = Math.atan2(dy, dx);
          const tr = e.target.r + 2;
          const targetX = e.target.x - Math.cos(angle) * tr;
          const targetY = e.target.y - Math.sin(angle) * tr;

          ctx.beginPath();
          ctx.moveTo(targetX, targetY);
          ctx.lineTo(targetX - 5 * Math.cos(angle - Math.PI / 6), targetY - 5 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(targetX - 5 * Math.cos(angle + Math.PI / 6), targetY - 5 * Math.sin(angle + Math.PI / 6));

          if (S.current.selectedNode && isConnected) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          } else {
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          }
          ctx.fill();
        }
      });

      // Draw nodes
      nodes.forEach(n => {
        const isHover = S.current.hoveredNode === n;
        const isSel = S.current.selectedNode === n;
        const isConnected = S.current.connectedNodes.has(n);

        let alpha = 1;

        const r = isHover ? n.r * 1.2 : n.r;

        ctx.save();
        ctx.globalAlpha = alpha;

        const isUnconnected = degree.get(n.id) === 0;
        const borderColor = (isUnconnected && n.wallet_type !== "bundle" && n.wallet_type !== "airdrop") ? "#6a6a6a" : (n.color || "#888780");

        if (isSel) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.4 * alpha;
          ctx.stroke();
          ctx.globalAlpha = alpha;
        }

        ctx.beginPath();
        // Custom shapes for hubs
        if (n.wallet_type === "airdrop" || n.wallet_type === "bundle") {
          // Draw a hexagon
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = n.x + r * Math.cos(angle);
            const py = n.y + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          
          ctx.fillStyle = borderColor;
          ctx.fill();
          
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = isHover || isSel ? 3 : 2;
          ctx.stroke();

          // Add a strong glow
          ctx.shadowColor = borderColor;
          ctx.shadowBlur = 15;
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          
          const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
          gradient.addColorStop(0, "#111");
          gradient.addColorStop(1, borderColor);
          ctx.fillStyle = gradient;
          ctx.fill();

          ctx.strokeStyle = borderColor;
          ctx.lineWidth = isHover || isSel ? 3 : 2;

          if (n.r > 15 && n.wallet_type !== "recipient") {
            ctx.setLineDash([4, 4]);
          } else {
            ctx.setLineDash([]);
          }
          ctx.stroke();
        }

        if (n.name) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          // Scale font size based on node radius, bounded between 5 and 16
          const fontSize = Math.max(5, Math.min(16, r * 0.8));
          ctx.font = `600 ${fontSize}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          
          // Add a subtle shadow for readability
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 4;
          ctx.fillText(n.name, n.x, n.y);
          ctx.shadowBlur = 0; // reset
        }

        ctx.restore();
      });

      ctx.restore();
    }

    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .filter((e) => {
        if (e.ctrlKey || e.button !== 0) return false;
        // Always allow 2-finger pinch, even if fingers are on nodes
        if (e.touches && e.touches.length >= 2) return true;
        if (e.type === "mousedown" || e.type === "touchstart") {
          const rect = canvas.getBoundingClientRect();
          const clientX = e.clientX ?? e.touches?.[0]?.clientX;
          const clientY = e.clientY ?? e.touches?.[0]?.clientY;
          if (clientX !== undefined && clientY !== undefined) {
            const x = (clientX - rect.left - S.current.transform.x) / S.current.transform.k;
            const y = (clientY - rect.top - S.current.transform.y) / S.current.transform.k;
            for (let i = nodes.length - 1; i >= 0; i--) {
              const n = nodes[i];
              const dx = x - n.x;
              const dy = y - n.y;
              const hitRadius = n.r + 12 / S.current.transform.k;
              if (dx * dx + dy * dy < hitRadius * hitRadius) {
                return false;
              }
            }
          }
        }
        return true;
      })
      .on("zoom", (e) => {
        S.current.transform = e.transform;
        if (!sim.alpha() || sim.alpha() < 0.01) {
          requestAnimationFrame(drawFrame);
        }
      });
    S.current.zoom = zoom;

    const drag = d3.drag()
      .subject((e) => {
        if (!e.sourceEvent) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.sourceEvent.clientX ?? e.sourceEvent.touches?.[0]?.clientX;
        const clientY = e.sourceEvent.clientY ?? e.sourceEvent.touches?.[0]?.clientY;
        if (clientX === undefined || clientY === undefined) return null;

        const x = (clientX - rect.left - S.current.transform.x) / S.current.transform.k;
        const y = (clientY - rect.top - S.current.transform.y) / S.current.transform.k;

        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          const dx = x - n.x;
          const dy = y - n.y;
          const hitRadius = n.r + 12 / S.current.transform.k;
          if (dx * dx + dy * dy < hitRadius * hitRadius) {
            return n; // allow dragging ANY node
          }
        }
        return null;
      })
      .on("start", (e) => {
        if (!e.active) sim.alphaTarget(0.3).restart();
        e.subject.fx = e.subject.x;
        e.subject.fy = e.subject.y;
        e.subject._wasDragged = false;
      })
      .on("drag", (e) => {
        e.subject._wasDragged = true;
        e.subject.fx += e.dx / S.current.transform.k;
        e.subject.fy += e.dy / S.current.transform.k;
        e.subject.x = e.subject.fx;
        e.subject.y = e.subject.fy;
        requestAnimationFrame(drawFrame);
      })
      .on("end", (e) => {
        if (!e.active) sim.alphaTarget(0);
        if (e.subject._wasDragged) {
          e.subject.manuallyDragged = true;
        } else {
          // It was just a click, no drag
        }
        e.subject.fx = null;
        e.subject.fy = null;
        delete e.subject._wasDragged;
      });

    d3.select(canvas)
      .call(zoom)
      .on("dblclick.zoom", null) // disable default dblclick (always zoom-in)
      .call(drag);

    // Custom double-tap / double-click: toggle zoom out when already zoomed in
    const handleDblClick = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX ?? e.touches?.[0]?.clientX ?? rect.left + rect.width / 2) - rect.left;
      const cy = (e.clientY ?? e.touches?.[0]?.clientY ?? rect.top + rect.height / 2) - rect.top;
      const k = S.current.transform.k;
      if (k > 1.15) {
        d3.select(canvas).transition().duration(300).call(zoom.transform, d3.zoomIdentity);
      } else {
        d3.select(canvas).transition().duration(300).call(zoom.scaleBy, 2, [cx, cy]);
      }
    };
    canvas.addEventListener("dblclick", handleDblClick);
    let lastTap = 0;
    canvas.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTap > 0 && now - lastTap < 350 && e.changedTouches.length === 1) {
        // double-tap detected, suppress d3's tap handling
        handleDblClick(e.changedTouches[0]);
      }
      lastTap = now;
    }, { passive: false });

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - S.current.transform.x) / S.current.transform.k;
      const y = (e.clientY - rect.top - S.current.transform.y) / S.current.transform.k;

      let found = null;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = x - n.x;
        const dy = y - n.y;
        const hitRadius = n.r + 12 / S.current.transform.k;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          found = n;
          break;
        }
      }

      if (found !== S.current.hoveredNode) {
        S.current.hoveredNode = found;
        canvas.style.cursor = found ? "pointer" : "default";
        if (!sim.alpha() || sim.alpha() < 0.01) requestAnimationFrame(drawFrame);
      }
    };

    canvas.onclick = () => {
      if (S.current.hoveredNode) {
        selectNodeById(S.current.hoveredNode.id);
      }
    };

    const resize = () => {
      if (!canvasRef.current) return;
      const parent = canvasRef.current.parentElement;
      if (!parent) return;
      
      const newW = parent.clientWidth;
      const newH = parent.clientHeight;
      if (newW === 0 || newH === 0) return; // skip when hidden
      
      W = newW;
      H = newH;
      canvas.width = W;
      canvas.height = H;
      S.current.width = W;
      S.current.height = H;

      sim.force("center", d3.forceCenter(W / 2, H / 2));
      sim.force("unconnectedRing", d3.forceRadial(
        Math.max(300, Math.min(W, H) * 0.45),
        W / 2,
        H / 2
      ).strength(d => degree.get(d.id) === 0 ? 0.1 : 0));
      sim.force("hubAnchor", d3.forceRadial(
        Math.max(150, Math.min(W, H) * 0.25),
        W / 2,
        H / 2
      ).strength(d => (d.wallet_type === "airdrop" || d.wallet_type === "bundle") ? 0.1 : 0));
      
      if (S.current.drawFrame) {
        requestAnimationFrame(S.current.drawFrame);
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);

    return () => {
      sim.stop();
      resizeObserver.disconnect();
      canvas.removeEventListener("dblclick", handleDblClick);
      canvas.onmousemove = null;
      canvas.onclick = null;
    };
  }, [canvasRef]);

  const clearSelection = useCallback(() => {
    if (S.current) {
      S.current.selectedNode = null;
      S.current.connectedNodes.clear();
      if (S.current.drawFrame) {
        requestAnimationFrame(S.current.drawFrame);
      }
    }
    setSelectedNode(null);
  }, []);

  const redraw = useCallback(() => {
    if (S.current && S.current.drawFrame) {
      requestAnimationFrame(S.current.drawFrame);
    }
  }, []);

  const zoomIn = useCallback(() => {
    if (!canvasRef.current || !S.current.zoom) return;
    d3.select(canvasRef.current).transition().duration(250).call(S.current.zoom.scaleBy, 1.4);
  }, [canvasRef]);
  const zoomOut = useCallback(() => {
    if (!canvasRef.current || !S.current.zoom) return;
    d3.select(canvasRef.current).transition().duration(250).call(S.current.zoom.scaleBy, 0.7);
  }, [canvasRef]);
  const resetZoom = useCallback(() => {
    if (!canvasRef.current || !S.current.zoom) return;
    d3.select(canvasRef.current).transition().duration(300).call(S.current.zoom.transform, d3.zoomIdentity);
  }, [canvasRef]);

  const selectNodeById = useCallback(id => {
    if (!S.current) return;
    const node = S.current.nodes.find(n => n.id === id);
    if (node) {
      S.current.selectedNode = node;
      S.current.connectedNodes.clear();
      S.current.edges.forEach(e => {
        if (e.source === node) S.current.connectedNodes.add(e.target);
        if (e.target === node) S.current.connectedNodes.add(e.source);
      });
      setSelectedNode({ ...node });
      if (S.current.drawFrame) requestAnimationFrame(S.current.drawFrame);
    }
  }, []);

  return { loadGraph, selectedNode, clearSelection, selectNodeById, redraw, zoomIn, zoomOut, resetZoom };
}
