import React from 'react';
import { Activity, Zap, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';
import { M3_DURATION_S, M3_EASING_ENTER } from '@/shared/lib/motion-constants';

const M3_ENTER = { duration: M3_DURATION_S, ease: M3_EASING_ENTER };

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
  <motion.div
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    transition={M3_ENTER}
    className="liquid-card-nested p-4 flex flex-col justify-between min-h-[100px] overflow-hidden"
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted font-mono">{label}</span>
      <span className="text-muted">{icon}</span>
    </div>
    <div className="text-2xl font-medium text-ceramic tracking-tight leading-none">{value}</div>
    <div className="text-xs text-muted font-medium mt-1 leading-relaxed">{detail}</div>
  </motion.div>
);

const STATUS_ITEMS = [
  { label: 'System', value: 'Operational', icon: <Activity size={16} />, detail: 'Core Status' },
  { label: 'Latency', value: '24ms', icon: <Zap size={16} />, detail: 'Average Response' },
  { label: 'Memory', value: 'Healthy', icon: <Cpu size={16} />, detail: 'Stability' },
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
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
          transition={M3_ENTER}
        >
          <StatusCard {...item} />
        </motion.div>
      ))}
    </motion.div>
  );
};

export default AIStatus;