/**
 * Animated Number Counter
 * Uses Framer Motion spring physics for smooth number transitions
 * @module widgets/financial-dashboard/ui/animated-counter
 */

'use client';

import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform, useInView } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  /** Format as currency (default: true) */
  currency?: boolean;
  /** Currency symbol (default: $) */
  symbol?: string;
  /** Decimal places (default: 0 for currency) */
  decimals?: number;
  /** Duration in seconds (default: 1.2) */
  duration?: number;
  /** Additional class names */
  className?: string;
}

export function AnimatedCounter({
  value,
  currency = true,
  symbol = '$',
  decimals = 0,
  duration = 1.2,
  className = '',
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  
  // Spring physics for organic movement
  const spring = useSpring(0, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });
  
  // Transform to formatted string
  const display = useTransform(spring, (latest) => {
    const formatted = latest.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return currency ? `${symbol}${formatted}` : formatted;
  });
  
  useEffect(() => {
    if (isInView) {
      spring.set(value);
    }
  }, [spring, value, isInView]);
  
  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.1 }}
    >
      {display}
    </motion.span>
  );
}

/**
 * Animated percentage change indicator
 */
interface PercentageChangeProps {
  current: number;
  previous: number;
  className?: string;
}

export function PercentageChange({ current, previous, className = '' }: PercentageChangeProps) {
  const percentage = previous === 0 
    ? (current > 0 ? 100 : 0)
    : ((current - previous) / previous) * 100;
  
  const isPositive = percentage >= 0;
  const displayValue = Math.abs(percentage).toFixed(1);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.3 }}
      className={`inline-flex items-center gap-1 text-sm font-medium ${className}`}
    >
      <motion.span
        initial={{ y: isPositive ? 4 : -4 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}
      >
        {isPositive ? '↑' : '↓'}
      </motion.span>
      <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
        {displayValue}%
      </span>
      <span className="text-ink-muted text-xs">vs last month</span>
    </motion.div>
  );
}
