export const widgetKey = 'recent-replies' as const;
export { RecentRepliesWidget } from './ui/RecentRepliesWidget';
export { getRecentReplies } from './api/get-recent-replies';
export type {
  RecentReplyItem,
  RecentRepliesData,
} from './api/get-recent-replies';
