import React from 'react';
import { Link } from 'wouter';
import { AnimatedSection } from './animated-section';
import { Linkedin } from 'lucide-react';
import { ContributorPortrait } from './contributor-portrait';
import { CoverPhoto } from './cover-photo';

interface ContributorCardProps {
  name: string;
  role: string;
  cutoutImage?: string;
  coverImage?: string;
  imageProvenance?: string;
  isPlaceholder?: boolean;
  linkedinUrl?: string;
  href: string;
  delay?: number;
}

export function ContributorCard({
  name,
  role,
  cutoutImage,
  coverImage,
  imageProvenance,
  isPlaceholder = false,
  linkedinUrl,
  href,
  delay = 0,
}: ContributorCardProps) {
  return (
    <AnimatedSection delay={delay} className="group flex flex-col h-full w-full max-w-[300px] text-left">
      <Link href={href} className="block outline-none focus-visible:ring-2 ring-primary ring-offset-background">
        <CoverPhoto src={coverImage} generated={imageProvenance === 'ai-generated-representative-artwork'} omitWhenUnavailable className="mb-3 aspect-video" />
        <ContributorPortrait
          name={name}
          image={cutoutImage}
          isPlaceholder={isPlaceholder}
          className="mb-6 transition-all duration-500 group-hover:border-primary/35 group-hover:shadow-[0_14px_34px_rgba(104,87,153,0.12)]"
          imageClassName="group-hover:scale-[1.025]"
        />
      </Link>

      <div className="mt-2">
        <div>
          <Link href={href} className="outline-none focus-visible:text-primary">
            <h3 className="text-2xl font-display mb-1.5 group-hover:text-primary transition-colors text-foreground leading-none">{name}</h3>
          </Link>
          <p className="text-[10px] tracking-[0.2em] uppercase font-semibold text-muted-foreground">{role}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-border/70 pt-4">
          {linkedinUrl ? (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`${name} on LinkedIn`}
            >
              <Linkedin className="h-3.5 w-3.5" />
              LinkedIn
            </a>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              No LinkedIn link
            </span>
          )}
      </div>
    </AnimatedSection>
  );
}
