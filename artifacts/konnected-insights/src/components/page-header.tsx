import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  category?: string;
  align?: 'left' | 'center';
  dark?: boolean;
  image?: string;
}

export function PageHeader({ title, subtitle, category, align = 'center', dark = false, image }: PageHeaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`relative pt-32 pb-24 md:pt-48 md:pb-32 overflow-hidden ${align === 'center' ? 'text-center' : 'text-left'} ${dark ? 'bg-[#0A0B10] text-[#F4F3EF]' : 'bg-background text-foreground border-b editorial-border-b'}`}>

      {image && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <img src={image} alt="" className={`w-full h-full object-cover scale-105 ${dark ? 'opacity-20 mix-blend-luminosity' : 'opacity-[0.32] mix-blend-multiply saturate-125 contrast-110'}`} />
          <div className={`absolute inset-0 bg-gradient-to-b ${dark ? 'from-transparent to-[#0A0B10]' : 'from-background/5 via-background/20 to-background/70'}`} />
        </div>
      )}

      <div className="container relative z-10 px-6 md:px-12 mx-auto">
        <div className={`max-w-4xl ${align === 'center' ? 'mx-auto' : ''}`}>
          {category && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-primary font-semibold tracking-[0.2em] uppercase text-xs mb-8 flex items-center gap-4 justify-start"
              style={{ justifyContent: align === 'center' ? 'center' : 'flex-start' }}
            >
              {align === 'left' && <span className="h-[1px] w-8 bg-primary"></span>}
              {category}
              {align === 'center' && <span className="h-[1px] w-8 bg-primary"></span>}
            </motion.div>
          )}

          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 1, delay: reduceMotion ? 0 : 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className={`text-5xl md:text-7xl lg:text-[5.5rem] font-display font-normal leading-[0.9] mb-8 tracking-tight ${dark ? 'text-[#F4F3EF]' : 'text-foreground'}`}
          >
            {/* Split title by " " and italicize specific words if desired, but for now we just render */}
            {title}
          </motion.h1>

          {subtitle && (
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 1, delay: reduceMotion ? 0 : 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
              className={`text-xl md:text-2xl leading-relaxed font-light ${dark ? 'text-[#F4F3EF]/70' : 'text-muted-foreground'}`}
            >
              {subtitle}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}
