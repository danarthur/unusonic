export const widgetKey = 'network-detail' as const;
export { NetworkDetailSheet } from './ui/NetworkDetailSheet';
export { NetworkDetailSheetWithSuspense } from './ui/NetworkDetailSheetWithSuspense';
export { IdentityHeader } from './ui/IdentityHeader';
export { EntityMoney } from './ui/EntityMoney';
/*
  PrivateNotes and DossierEditor lived here.

  PrivateNotes wrote `context_data.notes` on a relationship edge and rendered
  "Available for partners." whenever there was no edge -- which is most
  contacts. Private notes are on the entity now, in WorkingNotesCard, where
  they do not depend on how you happen to be related to somebody. Zero edges
  in production carried a note, so nothing was migrated. DossierEditor had no
  consumers at all.
*/
export { AionScoutInput } from './ui/AionScoutInput';
export { AionScoutInput as AionInput } from './ui/AionScoutInput';
export { CrewKitSection } from './ui/CrewKitSection';
export { RosterStatusCard } from './ui/network-detail-sheet/roster-actions';
export { DoNotRebookCard } from './ui/DoNotRebookCard';
