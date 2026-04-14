import React from 'react';
import { Activity, Zap, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';

const StatusCard = ({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  detail: string;
}) => (
  <StagePanel className="p-4 flex flex-col justify-between min-h-[100px]">
    <div className="flex items-center justify-between mb-2">
      <span className="stage-label font-mono">{label}</span>
      <span className="text-[var(--stage-text-secondary)]">{icon}</span>
    </div>
    <div className="text-2xl font-medium text-[var(--stage-text-primary)] tracking-tight leading-none tabular-nums">{value}</div>
    <div className="text-xs text-[var(--stage-text-secondary)] font-medium mt-1 leading-relaxed">{detail}</div>
  </StagePanel>
);

const STATUS_ITEMS = [
  { label: 'System', value: 'Operational', icon: <Activity size={16} strokeWidth={1.5} />, detail: 'Core status' },
  { label: 'Latency', value: '24ms', icon: <Zap size={16} strokeWidth={1.5} />, detail: 'Average response' },
  { label: 'Memory', value: 'Healthy', icon: <Cpu size={16} strokeWidth={1.5} />, detail: 'Stability' },
];

export const AIStatus = () => {
  return (
    <motion.div
      className="flex flex-col gap-4"
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
        hidden: {},
      }}
    >
      {STATUS_ITEMS.map((item) => (
        <motion.div
          key={item.label}
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          transition={STAGE_LIGHT}
        >
          <StatusCard {...item} />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default AIStatus;
