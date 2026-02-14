'use client';

import { type ReactNode } from 'react';
import { ScrollReveal, StaggerChildren, StaggerItem } from './scroll-reveal';

interface HomeAnimationsProps {
  children: ReactNode;
  type: 'section-header' | 'stagger-grid';
  className?: string;
}

export function HomeAnimations({ children, type, className }: HomeAnimationsProps) {
  if (type === 'section-header') {
    return <ScrollReveal className={className}>{children}</ScrollReveal>;
  }

  if (type === 'stagger-grid') {
    // Wrap each child in a StaggerItem
    const childrenArray = Array.isArray(children) ? children : [children];
    return (
      <StaggerChildren className={className}>
        {childrenArray.map((child, i) => (
          <StaggerItem key={i}>{child}</StaggerItem>
        ))}
      </StaggerChildren>
    );
  }

  return <>{children}</>;
}
