import { useEffect } from 'react';

interface MetadataProps {
  title: string;
  description?: string;
}

export function Metadata({ title, description = "An authoritative, human, image-led future-of-work publication rooted in the Middle East." }: MetadataProps) {
  useEffect(() => {
    const fullTitle = `${title} | Könnected Insights`;
    document.title = fullTitle;

    const setMeta = (name: string, content: string, isProperty = false) => {
      let tag = document.querySelector(`meta[${isProperty ? 'property' : 'name'}="${name}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(isProperty ? 'property' : 'name', name);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    setMeta('description', description);
    setMeta('og:title', fullTitle, true);
    setMeta('og:description', description, true);
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', description);
  }, [title, description]);

  return null;
}
