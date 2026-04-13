import { useState } from 'react';
import { Settings } from './pages/Settings';
import { Status } from './pages/Status';
import { LivingLogo } from './components/LivingLogo';

type Page = 'status' | 'settings';

export function App() {
  const [page, setPage] = useState<Page>('status');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header with Living Logo */}
      <div className="row" style={{
        padding: '12px var(--stage-padding)',
        background: 'var(--stage-surface)',
        borderBottom: '1px solid var(--stage-edge-top)',
        gap: '10px',
      }}>
        <LivingLogo size="sm" status="idle" />
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--stage-text-primary)',
        }}>
          Bridge
        </span>
      </div>

      {/* Nav tabs */}
      <nav className="nav">
        <button
          className="nav-tab"
          data-active={page === 'status'}
          onClick={() => setPage('status')}
        >
          Status
        </button>
        <button
          className="nav-tab"
          data-active={page === 'settings'}
          onClick={() => setPage('settings')}
        >
          Settings
        </button>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--stage-padding)' }}>
        {page === 'status' ? <Status /> : <Settings />}
      </div>
    </div>
  );
}
