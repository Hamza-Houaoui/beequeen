import React, { useState, useEffect, useRef } from 'react';
import { Logger } from '../utils/Logger';
import { Trash2, Download, Copy, Search, Filter, X, Terminal } from 'lucide-react';

const LEVEL_ORDER = ['ERROR', 'WARN', 'SUCCESS', 'INFO', 'DEBUG'];

const LEVEL_FILTERS = {
  all: { label: 'All', color: '#888' },
  ERROR: { label: 'Errors', color: '#dc3545' },
  WARN: { label: 'Warnings', color: '#ffc107' },
  SUCCESS: { label: 'Success', color: '#28a745' },
  INFO: { label: 'Info', color: '#17a2b8' },
  DEBUG: { label: 'Debug', color: '#6c757d' },
};

function getLevelColor(level) {
  switch (level) {
    case 'ERROR': return '#dc3545';
    case 'WARN': return '#ffc107';
    case 'SUCCESS': return '#28a745';
    case 'DEBUG': return '#6c757d';
    default: return '#17a2b8';
  }
}

export default function LogsScreen() {
  const [logs, setLogs] = useState([]);
  const [levelFilter, setLevelFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [stats, setStats] = useState({ total: 0, counts: {} });
  const scrollRef = useRef(null);
  const filterRef = useRef(null);

  useEffect(() => {
    setLogs(Logger.getLogs());
    setStats(Logger.getStats());

    const unsub = Logger.subscribe(() => {
      setLogs(Logger.getLogs());
      setStats(Logger.getStats());
    });

    const interval = setInterval(() => {
      setLogs(Logger.getLogs());
      setStats(Logger.getStats());
    }, 1000);

    return () => { unsub(); clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const handleClear = () => {
    if (window.confirm('Clear all logs?')) {
      Logger.clear();
    }
  };

  const filteredLogs = logs.filter(log => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const match = log.message?.toLowerCase().includes(q) ||
        log.file?.toLowerCase().includes(q) ||
        log.fn?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const levelCounts = {};
  LEVEL_ORDER.forEach(l => { levelCounts[l] = 0; });
  logs.forEach(l => { levelCounts[l.level] = (levelCounts[l.level] || 0) + 1; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      <div className="model-header" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={28} />
          Logcat
        </h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem' }}>
            {stats.total} logs
          </span>
          <button className="glass-button" onClick={Logger.copyLogs} title="Copy logs">
            <Copy size={16} /> Copy
          </button>
          <button className="glass-button" onClick={Logger.exportLogs} title="Download as JSON">
            <Download size={16} /> Export
          </button>
          <button className="glass-button" style={{ color: '#ef4444' }} onClick={handleClear}>
            <Trash2 size={16} /> Clear
          </button>
        </div>
      </div>

      {/* Level Filter Chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(LEVEL_FILTERS).map(([key, val]) => {
          const count = key === 'all' ? stats.total : (levelCounts[key] || 0);
          return (
            <button
              key={key}
              onClick={() => { setLevelFilter(key); filterRef.current?.focus(); }}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: `1px solid ${levelFilter === key ? val.color : 'rgba(255,255,255,0.1)'}`,
                background: levelFilter === key ? `${val.color}22` : 'transparent',
                color: levelFilter === key ? val.color : 'var(--color-text-dim)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: levelFilter === key ? 'bold' : 'normal',
                transition: 'all 0.2s',
              }}
            >
              {val.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
        <input
          ref={filterRef}
          type="text"
          className="glass-input"
          placeholder="Search logs..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ paddingLeft: '36px', paddingRight: '36px' }}
        />
        {searchText && (
          <X
            size={16}
            onClick={() => setSearchText('')}
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)', cursor: 'pointer' }}
          />
        )}
      </div>

      {/* Toggle auto-scroll */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
        <input
          type="checkbox"
          id="autoscroll"
          checked={autoScroll}
          onChange={e => setAutoScroll(e.target.checked)}
        />
        <label htmlFor="autoscroll">Auto-scroll to newest</label>
        <span style={{ marginLeft: 'auto' }}>
          Showing {filteredLogs.length} / {logs.length}
        </span>
      </div>

      {/* Log List */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.05)',
          fontFamily: "'Courier New', monospace",
          fontSize: '0.8rem',
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-dim)' }}>
            {searchText ? 'No logs match your search.' : 'No logs yet. Do something in the app!'}
          </div>
        ) : (
          filteredLogs.map((log, idx) => {
            const levelColor = getLevelColor(log.level);
            const isDuplicate = idx > 0 && filteredLogs[idx - 1]?.message === log.message && filteredLogs[idx - 1]?.level === log.level;
            return (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: isDuplicate ? '0 12px 0 12px' : '6px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: log.level === 'ERROR' ? 'rgba(220,53,69,0.05)' : log.level === 'WARN' ? 'rgba(255,193,7,0.03)' : 'transparent',
                  alignItems: isDuplicate ? 'center' : 'flex-start',
                  minHeight: isDuplicate ? '10px' : 'auto',
                }}
              >
                <span style={{
                  color: '#555',
                  minWidth: '90px',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                }}>
                  {log.timeMs}
                </span>
                <span style={{
                  color: levelColor,
                  minWidth: '52px',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                }}>
                  {log.level}
                </span>
                {!isDuplicate && (
                  <>
                    {log.file && (
                      <span style={{
                        color: '#666',
                        minWidth: '120px',
                        fontSize: '0.7rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {log.file}:{log.line}
                      </span>
                    )}
                    <span style={{
                      color: log.level === 'ERROR' ? '#f88' : log.level === 'WARN' ? '#fd7' : 'var(--color-text-primary)',
                      flex: 1,
                      wordBreak: 'break-word',
                    }}>
                      {log.message}
                    </span>
                  </>
                )}
                {isDuplicate && (
                  <span style={{ color: '#444', fontSize: '0.7rem', fontStyle: 'italic' }}>... repeated</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
