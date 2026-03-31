'use client';
import { useEffect, useRef } from 'react';
import { trackProposalView } from '../../api/track-proposal-view';

export function TrackView({ token }: { token: string }) {
  const didTrack = useRef(false);
  useEffect(() => {
    if (didTrack.current) return;
    didTrack.current = true;
    trackProposalView(token).catch(() => {});
  }, [token]);
  return null;
}
