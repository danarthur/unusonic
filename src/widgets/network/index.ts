export const widgetKey = 'network' as const;
/*
  NetworkGrid and EntitySheet lived here and are gone.

  Nothing imported either: this barrel's only live export is GenesisCard. The
  sheet's Private notes tab was the sole interface to `internal_rating`, and the
  sole remaining caller of `updatePrivateNotes` -- both of which wrote to a table
  that does not exist, so the tab had never saved anything.
*/
export { NetworkCard } from './ui/NetworkCard';
export { GenesisCard } from './ui/GenesisCard';
