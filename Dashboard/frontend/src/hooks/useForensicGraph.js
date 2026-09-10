import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export default function useForensicGraph(canvasRef, forensicData, visibleAddresses, toggleVisibleAddress) {
  const S = useRef({
    transform: d3.zoomIdentity,
    hoveredNode: null,
    hoveredEdge: null,
    draggedNode: null,
    sim: null
  });

  useEffect(() => {
    if (!canvasRef.current || !forensicData || !forensicData.edges) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Auto-resize
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (S.current.sim) {
        S.current.sim.alpha(0.1).restart();
      }
    };
    window.addEventListener('resize', resize);
    resize();

    const centerWallet = forensicData.wallet_address;
    
    // Keep nodes stable if they already exist to preserve dragged positions
    const existingNodes = new Map(S.current.sim ? S.current.sim.nodes().map(n => [n.id, n]) : []);
    
    const nodes = forensicData.nodes
      .filter(n => visibleAddresses.has(n.id))
      .map(n => {
        if (existingNodes.has(n.id)) {
           return existingNodes.get(n.id);
        }
        return { ...n };
      });

    const edges = forensicData.edges
      .filter(e => visibleAddresses.has(e.source.id || e.source) && visibleAddresses.has(e.target.id || e.target))
      .map(e => {
        const sourceId = e.source.id || e.source;
        const targetId = e.target.id || e.target;
        return { 
          ...e, 
          source: nodes.find(n => n.id === sourceId) || sourceId, 
          target: nodes.find(n => n.id === targetId) || targetId 
        };
      });

    if (S.current.sim) S.current.sim.stop();

    const W = canvas.width;
    const H = canvas.height;

    const centerNode = nodes.find(n => n.id === centerWallet);

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id(d => d.id).distance(200).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-800))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide().radius(90))
      .alpha(1)
      .on("tick", drawFrame);

    S.current.sim = sim;

    const BLOCK_W = 180;
    const BLOCK_H = 40;

    function drawFrame() {
      if (!canvasRef.current) return;
      const transform = S.current.transform;

      ctx.fillStyle = "#121216"; // Darker background
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Draw subtle grid
      ctx.strokeStyle = "rgba(255,255,255,0.02)";
      ctx.lineWidth = 1 / transform.k;
      const gridSize = 100;
      const startX = -transform.x / transform.k;
      const startY = -transform.y / transform.k;
      const endX = startX + W / transform.k;
      const endY = startY + H / transform.k;
      
      ctx.beginPath();
      for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();

      // Draw edges (Bezier curves)
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      edges.forEach(e => {
        const isHovered = S.current.hoveredEdge === e;
        
        // Connect from right side of source to left side of target
        const sx = e.source.x + BLOCK_W / 2;
        const sy = e.source.y;
        const tx = e.target.x - BLOCK_W / 2;
        const ty = e.target.y;

        // Cubic bezier control points
        const cp1x = sx + (tx - sx) / 2;
        const cp1y = sy;
        const cp2x = tx - (tx - sx) / 2;
        const cp2y = ty;
        
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tx, ty);
        
        ctx.strokeStyle = isHovered ? "rgba(255, 255, 255, 0.9)" : "rgba(147, 51, 234, 0.4)";
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        // Draw volume label in the middle of the curve
        const t_val = 0.5;
        const midX = Math.pow(1-t_val, 3)*sx + 3*Math.pow(1-t_val, 2)*t_val*cp1x + 3*(1-t_val)*Math.pow(t_val, 2)*cp2x + Math.pow(t_val, 3)*tx;
        const midY = Math.pow(1-t_val, 3)*sy + 3*Math.pow(1-t_val, 2)*t_val*cp1y + 3*(1-t_val)*Math.pow(t_val, 2)*cp2y + Math.pow(t_val, 3)*ty;
        
        const txt = e.tokens.length === 1 
          ? `${e.tokens[0].total_volume} ${e.tokens[0].token_symbol}` 
          : `${e.tokens.length} Tokens`;
        
        ctx.fillStyle = "rgba(18, 18, 22, 0.9)";
        const tw = ctx.measureText(txt).width + 8;
        ctx.fillRect(midX - tw/2, midY - 8, tw, 16);
        
        ctx.fillStyle = isHovered ? "#fff" : "#aaa";
        ctx.font = "10px monospace";
        ctx.fillText(txt, midX, midY);
      });

      // Draw block nodes
      nodes.forEach(n => {
        const isCenter = n.id === centerWallet;
        const isHovered = S.current.hoveredNode === n;
        
        const bx = n.x - BLOCK_W / 2;
        const by = n.y - BLOCK_H / 2;

        ctx.beginPath();
        ctx.roundRect(bx, by, BLOCK_W, BLOCK_H, 4);
        
        ctx.fillStyle = "rgba(30, 30, 35, 0.9)";
        ctx.fill();

        ctx.strokeStyle = isHovered ? "#fff" : (isCenter ? "#9333ea" : "rgba(255,255,255,0.2)");
        ctx.lineWidth = isCenter ? 1.5 : 1;
        ctx.stroke();

        // Text
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        if (n.name) {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px sans-serif";
          ctx.fillText(n.name, n.x, n.y - 6, BLOCK_W - 10);
          
          ctx.fillStyle = "#aaa";
          ctx.font = "10px monospace";
          const shortAddr = `${n.id.slice(0,6)}...${n.id.slice(-4)}`;
          ctx.fillText(shortAddr, n.x, n.y + 8);
        } else {
          ctx.fillStyle = "#fff";
          ctx.font = "12px monospace";
          const shortAddr = `${n.id.slice(0,6)}...${n.id.slice(-4)}`;
          ctx.fillText(shortAddr, n.x, n.y - 4);
          
          const connCount = edges.filter(e => e.source.id === n.id || e.target.id === n.id).length;
          ctx.fillStyle = "#888";
          ctx.font = "10px monospace";
          ctx.fillText(`${connCount} Connections`, n.x, n.y + 10);
        }

        if (isHovered) {
          const tbY = by + BLOCK_H;
          const tbH = 26;
          
          ctx.fillStyle = "rgba(40, 40, 45, 0.95)";
          ctx.beginPath();
          ctx.roundRect(bx, tbY, BLOCK_W, tbH, [0, 0, 4, 4]);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(bx + BLOCK_W/2, tbY + 4);
          ctx.lineTo(bx + BLOCK_W/2, tbY + tbH - 4);
          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.stroke();

          ctx.font = "10px monospace";
          ctx.textAlign = "center";
          
          ctx.fillStyle = "#f87171";
          ctx.fillText("x REMOVE", bx + BLOCK_W/4, tbY + 14);

          ctx.fillStyle = "#60a5fa";
          ctx.fillText("↗ ETHERSCAN", bx + (BLOCK_W*3)/4, tbY + 14);
        }
      });

      ctx.restore();
    }

    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .filter((e) => {
        if (e.type === "mousedown" || e.type === "touchstart") {
          const rect = canvas.getBoundingClientRect();
          const clientX = e.clientX ?? (e.touches && e.touches[0].clientX);
          const clientY = e.clientY ?? (e.touches && e.touches[0].clientY);
          if (clientX !== undefined) {
            const x = (clientX - rect.left - S.current.transform.x) / S.current.transform.k;
            const y = (clientY - rect.top - S.current.transform.y) / S.current.transform.k;
            for (let i = nodes.length - 1; i >= 0; i--) {
              const n = nodes[i];
              if (x >= n.x - BLOCK_W/2 && x <= n.x + BLOCK_W/2 && y >= n.y - BLOCK_H/2 && y <= n.y + BLOCK_H/2) {
                return false; 
              }
            }
          }
        }
        return !e.ctrlKey && !e.button;
      })
      .on("zoom", (e) => {
        S.current.transform = e.transform;
        requestAnimationFrame(drawFrame);
      });
    
    d3.select(canvas).call(zoom);

    d3.select(canvas).call(d3.drag()
      .subject((e) => {
        if (!e.sourceEvent) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.sourceEvent.clientX ?? (e.sourceEvent.touches && e.sourceEvent.touches[0].clientX);
        const clientY = e.sourceEvent.clientY ?? (e.sourceEvent.touches && e.sourceEvent.touches[0].clientY);
        if (clientX === undefined) return null;

        const x = (clientX - rect.left - S.current.transform.x) / S.current.transform.k;
        const y = (clientY - rect.top - S.current.transform.y) / S.current.transform.k;

        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          if (x >= n.x - BLOCK_W/2 && x <= n.x + BLOCK_W/2 && y >= n.y - BLOCK_H/2 && y <= n.y + BLOCK_H/2) {
            return n;
          }
        }
        return null;
      })
      .on("start", (e) => {
        // Unconditional restart to guarantee physics wakes up when dragged
        sim.alphaTarget(0.3).restart();
        e.subject.fx = e.subject.x;
        e.subject.fy = e.subject.y;
        S.current.draggedNode = e.subject;
      })
      .on("drag", (e) => {
        e.subject.fx += e.dx / S.current.transform.k;
        e.subject.fy += e.dy / S.current.transform.k;
        e.subject.x = e.subject.fx;
        e.subject.y = e.subject.fy;
        requestAnimationFrame(drawFrame);
      })
      .on("end", (e) => {
        sim.alphaTarget(0);
        // UNPIN the node so it can float freely again after drag!
        e.subject.fx = null;
        e.subject.fy = null;
        S.current.draggedNode = null;
      })
    );

    // Click detection for toolbar
    const handleClick = (e) => {
      if (!S.current.hoveredNode) return;
      
      const n = S.current.hoveredNode;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - S.current.transform.x) / S.current.transform.k;
      const y = (e.clientY - rect.top - S.current.transform.y) / S.current.transform.k;

      const bx = n.x - BLOCK_W / 2;
      const by = n.y - BLOCK_H / 2;
      const tbY = by + BLOCK_H;
      const tbH = 26;

      // Check if click is inside the toolbar area
      if (x >= bx && x <= bx + BLOCK_W && y >= tbY && y <= tbY + tbH) {
        if (x < bx + BLOCK_W / 2) {
          // Clicked REMOVE
          if (toggleVisibleAddress) toggleVisibleAddress(n.id);
        } else {
          // Clicked ETHERSCAN
          window.open(`https://etherscan.io/address/${n.id}`, '_blank');
        }
      }
    };
    canvas.addEventListener('click', handleClick);

    // Mouse hover
    canvas.onmousemove = (e) => {
      if (S.current.draggedNode) return; // Don't process hover while dragging

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - S.current.transform.x) / S.current.transform.k;
      const y = (e.clientY - rect.top - S.current.transform.y) / S.current.transform.k;

      let foundNode = null;
      for (const n of nodes) {
        // Expanded hitbox to include toolbar if currently hovered
        const tbH = (S.current.hoveredNode === n) ? 26 : 0;
        if (x >= n.x - BLOCK_W/2 && x <= n.x + BLOCK_W/2 && y >= n.y - BLOCK_H/2 && y <= n.y + BLOCK_H/2 + tbH) {
          foundNode = n;
          break;
        }
      }

      let foundEdge = null;
      if (!foundNode) {
        // Approximate edge hovering by checking distance to bezier midpoint
        for (const edge of edges) {
           const sx = edge.source.x + BLOCK_W / 2;
           const sy = edge.source.y;
           const tx = edge.target.x - BLOCK_W / 2;
           const ty = edge.target.y;
           
           const cp1x = sx + (tx - sx) / 2;
           const cp1y = sy;
           const cp2x = tx - (tx - sx) / 2;
           const cp2y = ty;

           const t_val = 0.5;
           const midX = Math.pow(1-t_val, 3)*sx + 3*Math.pow(1-t_val, 2)*t_val*cp1x + 3*(1-t_val)*Math.pow(t_val, 2)*cp2x + Math.pow(t_val, 3)*tx;
           const midY = Math.pow(1-t_val, 3)*sy + 3*Math.pow(1-t_val, 2)*t_val*cp1y + 3*(1-t_val)*Math.pow(t_val, 2)*cp2y + Math.pow(t_val, 3)*ty;
           
           const dx = x - midX;
           const dy = y - midY;
           if (Math.sqrt(dx*dx + dy*dy) < 20) {
              foundEdge = edge;
              break;
           }
        }
      }

      if (S.current.hoveredNode !== foundNode || S.current.hoveredEdge !== foundEdge) {
        S.current.hoveredNode = foundNode;
        S.current.hoveredEdge = foundEdge;
        canvas.style.cursor = (foundNode || foundEdge) ? 'pointer' : 'default';
        requestAnimationFrame(drawFrame);
      }
    };

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', handleClick);
      sim.stop();
    };
  }, [forensicData, visibleAddresses, toggleVisibleAddress]);
}
