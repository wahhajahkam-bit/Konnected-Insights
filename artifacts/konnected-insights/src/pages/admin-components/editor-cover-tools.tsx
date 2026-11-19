import { ImageIcon, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGenerateCoverImage } from '@/hooks/use-editorial';

export function EditorCoverTools({ collection, title, description, image, onChange }: {
  collection: string;
  title: string;
  description?: string;
  image?: string;
  onChange: (url: string | undefined, provenance?: string) => void;
}) {
  const generate = useGenerateCoverImage();
  return (
    <section aria-label="Optional cover artwork" className="space-y-3 border border-border bg-muted/10 p-4">
      <div className="flex items-start gap-3">
        {image
          ? <img src={image} alt="Current editorial cover" className="h-20 w-28 shrink-0 object-cover" />
          : <div className="flex h-20 w-28 shrink-0 items-center justify-center border border-dashed border-border"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>}
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-medium">{image ? 'Cover photo selected' : 'No cover photo'}</h4>
          <p className="text-xs text-muted-foreground">A cover is optional. Save or publish without one, crop a photo from your screenshots, or generate representative artwork.</p>
          <p className="text-xs text-muted-foreground">Generated artwork is not a source photograph or a portrait of a real author.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!title.trim() || generate.isPending}
          onClick={() => generate.mutate({ collection, title: title.trim(), description: description?.slice(0, 4000) }, {
            onSuccess: ({ data }) => onChange(data.url, data.provenance),
          })}
        >
          {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {generate.isPending ? 'Generating cover…' : image ? 'Generate replacement cover' : 'Generate cover artwork'}
        </Button>
        {image && <Button type="button" variant="ghost" size="sm" disabled={generate.isPending} onClick={() => onChange(undefined)}><X className="mr-2 h-4 w-4" />Remove cover</Button>}
        {!title.trim() && <p className="text-xs text-muted-foreground">Add a title to generate artwork.</p>}
      </div>
      {generate.error && <p role="alert" className="text-xs text-destructive">{generate.error.message}</p>}
    </section>
  );
}