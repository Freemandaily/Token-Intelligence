import React, { useState } from 'react';
import './ForensicPanel.css';

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

export default function ForensicPanel({ forensicData, visibleAddresses, toggleVisibleAddress }) {
  const [activeTab, setActiveTab] = useState('INFLOWS');
  const [copied, setCopied] = useState(null);

  if (!forensicData || !forensicData.edges) return null;

  const centerWallet = forensicData.wallet_address;

  const inflows = forensicData.edges
    .filter(e => e.target === centerWallet)
    .map(e => ({
       address: e.source,
       edge: e
    }));

  const outflows = forensicData.edges
    .filter(e => e.source === centerWallet)
    .map(e => ({
       address: e.target,
       edge: e
    }));

  const shortAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "Unknown";

  const handleCopy = (addr) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 2000);
  };

  const renderList = (items) => (
    <div className="arkham-list">
      {items.length === 0 ? <p className="arkham-empty">No trace nodes available</p> : null}
      {items.map((item, idx) => {
        const isVisible = visibleAddresses.has(item.address);
        
        // Sum total transfers
        const totalTransfers = item.edge.tokens.reduce((acc, t) => acc + t.transfer_count, 0);
        const tokensPreview = item.edge.tokens.map(t => t.token_symbol).slice(0, 2).join(", ");
        
        return (
          <div key={`${item.address}-${idx}`} className="arkham-row">
            <div className="arkham-row-left">
              <div className="arkham-row-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="arkham-addr" title={item.address}>{shortAddr(item.address)}</span>
                  <button 
                    className="arkham-copy-btn" 
                    onClick={() => handleCopy(item.address)}
                    title="Copy Address"
                  >
                    {copied === item.address ? <span style={{color: '#4ade80'}}>✓</span> : <CopyIcon />}
                  </button>
                </div>
                <span className="arkham-meta">{totalTransfers} txs • {tokensPreview}</span>
              </div>
            </div>
            
            <button 
              className={`arkham-toggle-btn ${isVisible ? 'is-visible' : 'not-visible'}`}
              onClick={() => toggleVisibleAddress(item.address)}
              title={isVisible ? "Hide node" : "Show node"}
            >
              {isVisible ? '−' : '+'}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="arkham-panel">
      <div className="arkham-panel-header">
        <h2 className="arkham-title">TRACE SEARCH</h2>
      </div>

      <div className="arkham-viewing-section">
        <span className="arkham-label">VIEWING:</span>
        <div className="arkham-center-pill">
           <span>{shortAddr(centerWallet)}</span>
           <button 
             className="arkham-copy-btn" 
             onClick={() => handleCopy(centerWallet)}
             title="Copy Address"
           >
             {copied === centerWallet ? <span style={{color: '#4ade80'}}>✓</span> : <CopyIcon />}
           </button>
        </div>
      </div>
      
      <div className="arkham-toggle-section">
        <h3 className="arkham-section-title">TOGGLE VISIBLE TRACE NODES:</h3>
        
        <div className="arkham-tabs">
          <button 
            className={`arkham-tab ${activeTab === 'INFLOWS' ? 'active' : ''}`}
            onClick={() => setActiveTab('INFLOWS')}
          >
            INFLOWS
          </button>
          <button 
            className={`arkham-tab ${activeTab === 'OUTFLOWS' ? 'active' : ''}`}
            onClick={() => setActiveTab('OUTFLOWS')}
          >
            OUTFLOWS
          </button>
        </div>

        <div className="arkham-scroll-container">
          {activeTab === 'INFLOWS' ? renderList(inflows) : renderList(outflows)}
        </div>
      </div>
    </div>
  );
}
