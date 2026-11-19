import React from 'react';
import { useFutureWorkFreshness } from '@/hooks/use-future-work';
import { AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

export function FreshnessBadge() {
  const { data: freshness, isLoading } = useFutureWorkFreshness();
  const reduceMotion = useReducedMotion();

  if (isLoading || !freshness) return null;

  const isWarning = freshness.status === 'overdue' || freshness.status === 'unrefreshed';

  const content = (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase tracking-widest font-medium border rounded-full transition-colors ${
      isWarning 
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-500 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400' 
        : 'border-green-500/30 bg-green-500/10 text-green-600 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400'
    }`}>
      {isWarning ? (
        <AlertCircle className="w-3 h-3" />
      ) : (
        <CheckCircle2 className="w-3 h-3" />
      )}
      <span>
        <span className="sm:hidden">Freshness</span>
        <span className="hidden sm:inline">Content freshness</span>
      </span>
      {freshness.overdueCount > 0 && (
        <span className="bg-amber-500/20 px-1.5 rounded-full">
          {freshness.overdueCount}
        </span>
      )}
    </div>
  );

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center"
      title={freshness.label}
    >
      {isWarning && freshness.href ? (
        <Link href={freshness.href} aria-label={`Content freshness: ${freshness.label}`} className="hover:opacity-80 transition-opacity">
          {content}
        </Link>
      ) : (
        content
      )}
    </motion.div>
  );
}
