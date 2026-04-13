type SyncResult = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  matchedCount: number;
  totalCount: number;
  unmatchedSongs: string[];
  syncedAt: string;
};

export function SyncStatusRow({ sync }: { sync: SyncResult }) {
  const allMatched = sync.matchedCount === sync.totalCount;
  const date = new Date(sync.eventDate);
  const dateStr = date.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <div className="sync-row" data-partial={!allMatched}>
      <div className="row between">
        <span style={{ fontSize: '13px', fontWeight: 500 }} className="truncate flex-1">
          {sync.eventTitle}
        </span>
        <span className="text-xs text-tertiary shrink-0">{dateStr}</span>
      </div>

      <div className="row" style={{ marginTop: '4px', gap: '6px' }}>
        <span
          className="status-dot"
          data-status={allMatched ? 'synced' : 'warning'}
        />
        <span className="text-xs text-secondary" style={{ fontFamily: 'var(--font-mono)' }}>
          {sync.matchedCount}/{sync.totalCount} matched
        </span>
      </div>

      {sync.unmatchedSongs.length > 0 && (
        <div style={{ marginTop: '4px', paddingLeft: '12px' }}>
          {sync.unmatchedSongs.slice(0, 3).map((name, i) => (
            <div key={i} className="text-xxs text-tertiary truncate">{name}</div>
          ))}
          {sync.unmatchedSongs.length > 3 && (
            <div className="text-xxs text-tertiary">
              +{sync.unmatchedSongs.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
