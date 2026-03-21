/**
 * Revenue Chart Component
 * Animated sparkline chart for monthly revenue trends
 * @module widgets/financial-dashboard/ui/revenue-chart
 */

'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { MonthlyRevenue } from '@/features/finance-sync';

interface RevenueChartProps {
  data: MonthlyRevenue[];
  className?: string;
}

export function RevenueChart({ data, className = '' }: RevenueChartProps) {
  const springConfig = { type: 'spring', stiffness: 100, damping: 20 } as const;
  
  // Prepare chart data (last 6 months)
  const chartData = useMemo(() => {
    const sorted = [...data]
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      .slice(-6);
    
    if (sorted.length === 0) return [];
    
    const maxValue = Math.max(...sorted.map(d => d.revenue), 1);
    const minValue = Math.min(...sorted.map(d => d.revenue), 0);
    const range = maxValue - minValue || 1;
    
    return sorted.map((item, index) => ({
      ...item,
      normalizedValue: ((item.revenue - minValue) / range),
      label: new Date(item.month).toLocaleDateString('en-US', { month: 'short' }),
      index,
    }));
  }, [data]);
  
  // Generate SVG path for the sparkline
  const pathData = useMemo(() => {
    if (chartData.length < 2) return '';
    
    const width = 100;
    const height = 40;
    const padding = 4;
    const effectiveWidth = width - padding * 2;
    const effectiveHeight = height - padding * 2;
    
    const points = chartData.map((d, i) => ({
      x: padding + (i / (chartData.length - 1)) * effectiveWidth,
      y: padding + (1 - d.normalizedValue) * effectiveHeight,
    }));
    
    // Create smooth bezier curve
    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const tension = 0.3;
      
      const cp1x = prev.x + (curr.x - prev.x) * tension;
      const cp1y = prev.y;
      const cp2x = curr.x - (curr.x - prev.x) * tension;
      const cp2y = curr.y;
      
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }
    
    return path;
  }, [chartData]);
  
  // Area fill path
  const areaPath = useMemo(() => {
    if (!pathData) return '';
    const width = 100;
    const height = 40;
    const padding = 4;
    
    return `${pathData} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;
  }, [pathData]);
  
  if (chartData.length < 2) {
    return (
      <div className={`h-16 flex items-center justify-center text-xs text-ink-muted ${className}`}>
        No revenue data yet — connect QuickBooks or add invoices
      </div>
    );
  }
  
  return (
    <div className={`relative ${className}`}>
      {/* SVG Chart */}
      <svg
        viewBox="0 0 100 40"
        className="w-full h-16"
        preserveAspectRatio="none"
      >
        {/* Gradient Definition */}
        <defs>
          <linearGradient id="revenueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--walnut)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--walnut)" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Area Fill — only render when path is valid (starts with M) to avoid "Expected moveto path command" error */}
        {areaPath?.startsWith('M') && (
          <motion.path
            d={areaPath}
            fill="url(#revenueGradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          />
        )}
        
        {/* Line */}
        {pathData?.startsWith('M') && (
          <motion.path
            d={pathData}
            fill="none"
            stroke="var(--walnut)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ ...springConfig, duration: 1.5 }}
          />
        )}
        
        {/* Data Points */}
        {chartData.map((point, i) => {
          const width = 100;
          const height = 40;
          const padding = 4;
          const effectiveWidth = width - padding * 2;
          const effectiveHeight = height - padding * 2;
          
          const x = padding + (i / (chartData.length - 1)) * effectiveWidth;
          const y = padding + (1 - point.normalizedValue) * effectiveHeight;
          
          return (
            <motion.circle
              key={point.label}
              cx={x}
              cy={y}
              r="2"
              fill="var(--background)"
              stroke="var(--walnut)"
              strokeWidth="1.5"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...springConfig, delay: 0.5 + i * 0.1 }}
            />
          );
        })}
      </svg>
      
      {/* Month Labels */}
      <div className="flex justify-between mt-2 px-1">
        {chartData.map((point, i) => (
          <motion.span
            key={point.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.6 + i * 0.05 }}
            className="text-[10px] text-ink-muted font-medium"
          >
            {point.label}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
