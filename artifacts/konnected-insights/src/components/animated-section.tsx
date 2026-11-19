import React, { useRef } from 'react';
import { motion, useInView, useReducedMotion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  stagger?: boolean;
}

export function AnimatedSection({
  children,
  className,
  delay = 0,
  direction = 'up',
  stagger = false,
}: AnimatedSectionProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduceMotion = useReducedMotion();

  const getVariants = (): Variants => {
    if (stagger) {
      return {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.1,
            delayChildren: delay,
          }
        }
      };
    }

    const y = reduceMotion ? 0 : direction === 'up' ? 40 : direction === 'down' ? -40 : 0;
    const x = reduceMotion ? 0 : direction === 'left' ? 40 : direction === 'right' ? -40 : 0;

    return {
      hidden: { opacity: 0, y, x },
      visible: {
        opacity: 1,
        y: 0,
        x: 0,
        transition: {
          duration: reduceMotion ? 0 : 0.8,
          ease: [0.21, 0.47, 0.32, 0.98] as [number, number, number, number],
          delay
        }
      }
    };
  };

  return (
    <motion.div
      ref={ref}
      variants={getVariants()}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

export const AnimatedItem = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: reduceMotion ? 0 : 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: reduceMotion ? 0 : 0.5, ease: "easeOut" }
        }
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
