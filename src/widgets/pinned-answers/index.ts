// Client-safe barrel. The server fetcher at api/get-pinned-answers.ts imports
// 'server-only' and must be imported directly from its subpath by Server
// Components — never re-exported here or Next bundles it into the client.
export { PinnedAnswersWidget, widgetKey } from './ui/PinnedAnswersWidget';
