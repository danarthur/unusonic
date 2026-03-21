import React from 'react';
import { Briefcase, User, Calendar, Circle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface TimelineItemProps {
  item: {
    id: string;
    time: string;
    text: string;
    // We allow string generally, but check for specific types for icons
    type?: string; 
    timestamp?: Date;
    content?: string; // Fallback for old data
  };
  isLast?: boolean; // To hide the connector line on the last item
}

export const TimelineItem: React.FC<TimelineItemProps> = ({ item, isLast }) => {
  // normalize text (handle legacy content prop)
  const displayText = item.content || item.text || 'New Event';
  
  // Normalize type
  const type = item.type?.toLowerCase() || 'event';
  const isWork = type === 'work';
  const isPersonal = type === 'personal';

  // ICON LOGIC: Select Icon & Color based on type
  const Icon = isWork ? Briefcase : isPersonal ? User : Calendar;
  
  // COLOR LOGIC: Work = Walnut, Personal = Emerald, Event = Blue/Gray
  const iconBg = isWork ? 'bg-ink/10' : isPersonal ? 'bg-emerald-500/10' : 'bg-blue-500/10';
  const iconColor = isWork ? 'text-ink' : isPersonal ? 'text-emerald-600' : 'text-blue-600';
  const lineColor = 'bg-ink/10';

  return (
    <div className="relative flex gap-4 pl-1 group min-h-[60px]">
      
      {/* LEFT: TIMELINE VISUALS */}
      <div className="flex flex-col items-center">
        {/* The Dot/Icon */}
        <div
          className={cn(
            'relative z-10 w-8 h-8 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 liquid-panel !rounded-full',
            iconBg
          )}
        >
          <Icon size={14} className={iconColor} strokeWidth={2} />
        </div>
        
        {/* The Connector Line (Hidden if last item) */}
        {!isLast && (
          <div className={`w-px flex-1 ${lineColor} my-2`} />
        )}
      </div>

      {/* RIGHT: CONTENT */}
      <div className="flex-1 pb-2 pt-1">
        <div className="flex justify-between items-start">
           <h4 className="text-sm font-semibold text-ink group-hover:text-ink transition-colors leading-tight">
             {displayText}
           </h4>
           <span className="text-[10px] font-mono text-ink-muted bg-stone/40 px-1.5 py-0.5 rounded-md whitespace-nowrap ml-2">
             {item.time}
           </span>
        </div>
        
        {/* Subtext based on type */}
        <p className="text-xs text-ink-muted mt-1 line-clamp-1 opacity-80 group-hover:opacity-100 transition-opacity">
          {isWork ? 'Invisible Touch Events' : isPersonal ? 'Personal Calendar' : 'General'}
        </p>
      </div>
      
    </div>
  );
};

// Default export if you prefer it
export default TimelineItem;