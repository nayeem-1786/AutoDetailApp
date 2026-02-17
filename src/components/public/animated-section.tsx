'use client';

import { motion, type Variants } from 'framer-motion';
import { type ReactNode } from 'react';
import { fadeInUp, staggerContainer } from '@/lib/animations';

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  stagger?: boolean;
  delay?: number;
}

export default function AnimatedSection({
  children,
  className = '',
  variants = fadeInUp,
  stagger = false,
  delay = 0,
}: AnimatedSectionProps) {
  return (
    <motion.div
      variants={stagger ? staggerContainer : variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      className={className}
      transition={delay ? { delay } : undefined}
    >
      {stagger ? children : (
        <motion.div variants={variants}>{children}</motion.div>
      )}
    </motion.div>
  );
}

export function AnimatedItem({
  children,
  className = '',
  variants = fadeInUp,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  return (
    <motion.div variants={variants} className={className}>
      {children}
    </motion.div>
  );
}
