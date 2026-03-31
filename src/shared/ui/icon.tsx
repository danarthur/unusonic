import type { LucideIcon, LucideProps } from 'lucide-react';

interface IconProps extends Omit<LucideProps, 'ref'> {
  icon: LucideIcon;
}

export function Icon({ icon: IconComponent, strokeWidth = 1.5, size = 16, ...props }: IconProps) {
  return <IconComponent strokeWidth={strokeWidth} size={size} {...props} />;
}
