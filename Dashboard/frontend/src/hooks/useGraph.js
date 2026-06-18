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
    const W = parent.clientWidth;
    const H = parent.clientHeight;
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

    function arcForce() {
      let forceNodeById = new Map();
      function force(alpha) {
        hubLeaves.forEach((leafIds, hubId) => {
          const hub = forceNodeById.get(hubId);
          if (!hub) return;

          let dx, dy;
          const backboneIds = hubBackbone.get(hubId);
          if (backboneIds && backboneIds.length > 0) {
            let bx = 0, by = 0, count = 0;
            backboneIds.forEach(id => {
              const n = forceNodeById.get(id);
              if (n) { bx += n.x; by += n.y; count++; }
            });
            if (count > 0) {
              // Point TOWARDS the center of mass of the backbone neighbors
              // so the leaves trail towards the connected nodes (comet effect)
              dx = (bx / count) - hub.x;
              dy = (by / count) - hub.y;
            } else {
              dx = W / 2 - hub.x;
              dy = H / 2 - hub.y;
            }
          } else {
            dx = W / 2 - hub.x;
            dy = H / 2 - hub.y;
          }
          
          const baseAngle = (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx);

          let currentRadius = Math.max(45, hub.r + 35);
          let remaining = leafIds.length;
          let i = 0;

          while (remaining > 0) {
            const arcSpread = Math.PI * 1.5;
            const maxNodesThisLayer = Math.max(5, Math.floor((arcSpread * currentRadius) / 20));
            const nodesInLayer = Math.min(remaining, maxNodesThisLayer);

            const actualSpread = nodesInLayer === 1 ? 0 : Math.min(arcSpread, nodesInLayer * 0.3);
            const startAngle = baseAngle - actualSpread / 2;
            const angleStep = nodesInLayer > 1 ? actualSpread / (nodesInLayer - 1) : 0;

            for (let j = 0; j < nodesInLayer; j++) {
              const leafId = leafIds[i];
              const leaf = forceNodeById.get(leafId);
              if (leaf && !leaf.manuallyDragged) {
                const angle = startAngle + j * angleStep;
                leaf.fx = hub.x + Math.cos(angle) * currentRadius;
                leaf.fy = hub.y + Math.sin(angle) * currentRadius;
              }
              i++;
            }
            remaining -= nodesInLayer;
            currentRadius += 22;
          }
        });
      }
      force.initialize = function (_nodes) {
        forceNodeById.clear();
        _nodes.forEach(n => forceNodeById.set(n.id, n));
      };
      return force;
    }

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).distance(100).strength(d => {
        const sid = typeof d.source === "object" ? d.source.id : d.source;
        const tid = typeof d.target === "object" ? d.target.id : d.target;
        return (degree.get(sid) === 1 || degree.get(tid) === 1) ? 0.05 : Math.min(0.8, d.weight * 0.15);
      }))
      .force("charge", d3.forceManyBody().strength(d => degree.get(d.id) === 1 ? -10 : -150 - d.r * 5))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("gravityX", d3.forceX(W / 2).strength(d => degree.get(d.id) > 0 ? 0.02 : 0))
      .force("gravityY", d3.forceY(H / 2).strength(d => degree.get(d.id) > 0 ? 0.02 : 0))
      .force("unconnectedRing", d3.forceRadial(
        Math.max(300, Math.min(W, H) * 0.45),
        W / 2,
        H / 2
      ).strength(d => degree.get(d.id) === 0 ? 0.6 : 0))
      .force("arc", arcForce())
      .alpha(isUpdate ? 0.2 : 1)
      .on("tick", drawFrame);

    function drawFrame() {
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
        const borderColor = isUnconnected ? "#6a6a6a" : (n.color || "#888780");

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
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

        const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
        gradient.addColorStop(0, "#111");
        gradient.addColorStop(1, borderColor);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isHover || isSel ? 3 : 2;

        if (n.r > 15) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();

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
        // Allow standard zooming behavior (prevent right click etc)
        if (e.ctrlKey || e.button !== 0) return false;

        // If clicking on a node, disable the canvas pan/zoom behavior!
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
              // visual hit tolerance of 12 pixels scaled by zoom
              const hitRadius = n.r + 12 / S.current.transform.k;
              if (dx * dx + dy * dy < hitRadius * hitRadius) {
                return false; // Node hit! Ignore pan!
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
        sim.stop(); // Temporarily pause the physics engine during the drag
        
        // Find neighbors that have exactly ONE connection (degree === 1)
        const allowedToMove = new Set();
        allowedToMove.add(e.subject.id);
        
        edges.forEach(edge => {
          let neighborId = null;
          let sid = typeof edge.source === "object" ? edge.source.id : edge.source;
          let tid = typeof edge.target === "object" ? edge.target.id : edge.target;

          if (sid === e.subject.id) neighborId = tid;
          else if (tid === e.subject.id) neighborId = sid;

          if (neighborId && degree.get(neighborId) === 1) {
            allowedToMove.add(neighborId);
          }
        });

        // Store this so drag can use it without recalculating
        e.subject._allowedToMove = allowedToMove;
        e.subject._wasDragged = false;
      })
      .on("drag", (e) => {
        e.subject._wasDragged = true;
        const trueDx = e.dx / S.current.transform.k;
        const trueDy = e.dy / S.current.transform.k;

        // Move ONLY the hub and its 1-degree leaves perfectly with the mouse.
        // The rest of the graph stays exactly where it is.
        nodes.forEach(n => {
          if (e.subject._allowedToMove && e.subject._allowedToMove.has(n.id)) {
            n.x += trueDx;
            n.y += trueDy;
            n.fx = n.x; // Lock them rigidly to the dragged position
            n.fy = n.y;
          }
        });

        // Draw immediately since physics is stopped
        requestAnimationFrame(drawFrame);
      })
      .on("end", (e) => {
        delete e.subject._allowedToMove;
        
        if (e.subject._wasDragged) {
          e.subject.manuallyDragged = true;
          // Do NOT restart physics!
          // Leaving it paused ensures the dragged cluster stays exactly where placed 
          // and prevents the stretched elastic lines from pulling the rest of the graph.
        } else {
          // It was just a click! Resume physics without heating it up
          // This prevents the graph from vibrating wildly on click
          sim.restart();
        }
        
        delete e.subject._wasDragged;
      });

    d3.select(canvas)
      .call(zoom)
      .call(drag);

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

    return () => {
      sim.stop();
      canvas.onmousemove = null;
      canvas.onclick = null;
    };
  }, [canvasRef]);

  const clearSelection = useCallback(() => {
    if (S.current) {
      S.current.selectedNode = null;
      S.current.connectedNodes.clear();
      if (canvasRef.current) {
        // trigger redraw
        const event = new Event("mousemove");
        event.clientX = -999;
        canvasRef.current.dispatchEvent(event);
      }
    }
    setSelectedNode(null);
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

      if (canvasRef.current) {
        const event = new Event("mousemove");
        event.clientX = -999;
        canvasRef.current.dispatchEvent(event);
      }
    }
  }, [canvasRef]);

  return { loadGraph, selectedNode, clearSelection, selectNodeById };
}
