import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'wouter';
import { AnimatedSection } from './animated-section';
import { CoverPhoto } from './cover-photo';

interface ArticleCardProps {
  title: string;
  excerpt?: string;
  image?: string;
  category?: string;
  author?: { name?: string; image?: string };
  href?: string;
  imageProvenance?: string;
  isExternal?: boolean;
  delay?: number;
}

export function ArticleCard({ title, excerpt, image, category, author, href, isExternal, imageProvenance, delay = 0 }: ArticleCardProps) {
  const content = (
    <AnimatedSection delay={delay} className="group flex flex-col h-full cursor-pointer bg-card/60 backdrop-blur-sm border border-border overflow-hidden hover:border-primary/40 transition-all duration-500 hover:shadow-[0_0_30px_rgba(104,87,153,0.1)]">
      {(
        <div className="relative overflow-hidden aspect-[16/10] bg-muted border-b border-border">
          <CoverPhoto src={image} alt={title} generated={imageProvenance === 'ai-generated-representative-artwork'} className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-primary/5 group-hover:bg-transparent transition-colors duration-700 pointer-events-none mix-blend-overlay" />

          {isExternal && href && (
            <div className="absolute top-4 right-4 h-10 w-10 bg-background/80 backdrop-blur-md border border-border flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 rounded-full shadow-md">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col flex-grow p-8 md:p-10">
        {category && (
          <div className="text-primary tracking-[0.2em] uppercase text-[10px] font-semibold mb-6 flex items-center gap-3">
            <span className="h-[1px] w-6 bg-primary"></span>
            {category}
          </div>
        )}
        <h3 className="text-2xl md:text-3xl font-display leading-[1.1] mb-6 text-card-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        {excerpt && (
          <p className="text-muted-foreground line-clamp-3 text-base leading-relaxed mb-8 flex-grow font-light">
            {excerpt}
          </p>
        )}

        {author?.name && (
          <div className="flex items-center gap-4 mt-auto pt-6 border-t border-border/50">
            {author.image ? (
              <img src={author.image} alt={author.name} className="h-10 w-10 object-cover transition-all duration-500" />
            ) : (
              <div className="h-10 w-10 bg-muted flex items-center justify-center text-muted-foreground text-sm font-display italic">
                {author.name.charAt(0)}
              </div>
            )}
            <div>
               <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground block mb-1 font-semibold">Author</span>
               <span className="text-sm font-medium text-foreground tracking-wide">{author.name}</span>
            </div>
          </div>
        )}
      </div>
    </AnimatedSection>
  );

  if (!href?.trim()) return content;
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full outline-none focus-visible:ring-2 ring-primary ring-offset-background">
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className="block h-full outline-none focus-visible:ring-2 ring-primary ring-offset-background">
      {content}
    </Link>
  );
}
