import React, { useRef, useEffect } from 'react';
import useForensicGraph from '../hooks/useForensicGraph';

export default function ForensicGraph({ forensicData, visibleAddresses, toggleVisibleAddress }) {
  const canvasRef = useRef(null);
  
  useForensicGraph(canvasRef, forensicData, visibleAddresses, toggleVisibleAddress);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100vw',
        height: '100vh',
        display: 'block',
        background: '#0a0a14',
      }}
    />
  );
}
