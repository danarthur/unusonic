export const widgetKey = 'this-week' as const;
export { ThisWeekWidget } from './ui/ThisWeekWidget';
export { getThisWeek } from './api/get-this-week';
export type { ThisWeekDay, ThisWeekEntry } from './api/get-this-week';
