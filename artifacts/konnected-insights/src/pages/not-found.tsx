import React from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Metadata } from "@/components/metadata";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center selection:bg-primary selection:text-primary-foreground">
      <Metadata title="404 - Not Found" />
      <div className="noise-overlay" />
      <div className="relative z-10 text-center max-w-2xl px-6">
        <div className="text-[12rem] font-display italic text-foreground/5 leading-none mb-4 pointer-events-none select-none">
          404
        </div>
        <h1 className="text-4xl font-display mb-6">Page not found</h1>
        <p className="text-muted-foreground font-light text-lg mb-12">
          The research brief, dispatch, or insight you are looking for has been archived, moved, or does not exist.
        </p>
        <Link href="/" className="inline-flex items-center gap-3 text-sm tracking-widest uppercase font-semibold text-primary hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Return to Homepage
        </Link>
      </div>
    </div>
  );
}
