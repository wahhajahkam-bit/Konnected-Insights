import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { uploadApi } from '@/lib/api';

type MediaField = 'cover' | 'author';

type ScreenshotCropDialogProps = {
  file: File | null;
  field: MediaField;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (field: MediaField, url: string) => void;
};

type ImageSize = { width: number; height: number };

const outputSize = {
  cover: { width: 1600, height: 900 },
  author: { width: 800, height: 800 },
} satisfies Record<MediaField, ImageSize>;

function sourceRectangle(
  image: ImageSize,
  field: MediaField,
  zoom: number,
  centerX: number,
  centerY: number,
) {
  const targetAspect = outputSize[field].width / outputSize[field].height;
  let width = image.width / zoom;
  let height = width / targetAspect;
  if (height > image.height / zoom) {
    height = image.height / zoom;
    width = height * targetAspect;
  }
  return {
    width,
    height,
    x: Math.max(0, Math.min(image.width - width, (image.width - width) * centerX)),
    y: Math.max(0, Math.min(image.height - height, (image.height - height) * centerY)),
  };
}

function uploadPublicCrop(blob: Blob, fileName: string) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', uploadApi.uploadUrl);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', 'image/jpeg');
    request.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
    request.onload = () => {
      let response: { data?: { url?: string }; error?: { message?: string } } = {};
      try {
        response = JSON.parse(request.responseText || '{}');
      } catch {
        // The generic message below covers non-JSON upstream failures.
      }
      if (request.status >= 200 && request.status < 300 && response.data?.url) {
        resolve(response.data.url);
      } else {
        reject(new Error(response.error?.message || 'The cropped image could not be uploaded.'));
      }
    };
    request.onerror = () => reject(new Error('The cropped image upload was interrupted.'));
    request.send(blob);
  });
}

export function ScreenshotCropDialog({
  file,
  field,
  open,
  onOpenChange,
  onApply,
}: ScreenshotCropDialogProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1.25);
  const [centerX, setCenterX] = useState(0.5);
  const [centerY, setCenterY] = useState(0.5);
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const localUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);

  useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  useEffect(() => {
    if (!open) return;
    setZoom(1.25);
    setCenterX(0.5);
    setCenterY(0.5);
    setConfirmed(false);
    setError('');
    setImageSize(null);
  }, [open, file, field]);

  const crop = imageSize
    ? sourceRectangle(imageSize, field, zoom, centerX, centerY)
    : null;

  const createCrop = async () => {
    const image = imageRef.current;
    if (!image || !imageSize || !crop || !file) return;
    setUploading(true);
    setError('');
    try {
      const dimensions = outputSize[field];
      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser cannot prepare the cropped image.');
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        dimensions.width,
        dimensions.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('The crop could not be created.')), 'image/jpeg', 0.9)
      );
      const url = await uploadPublicCrop(blob, `${field}-from-screenshot.jpg`);
      onApply(field, url);
      onOpenChange(false);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'The cropped image could not be used.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={uploading ? undefined : onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crop {field === 'cover' ? 'cover image' : 'author photo'}</DialogTitle>
          <DialogDescription>
            Only the area inside the frame will become a public editorial image. The original screenshot stays private.
          </DialogDescription>
        </DialogHeader>

        {file && (
          <div className="space-y-4">
            <div className="relative mx-auto max-h-[46vh] w-fit overflow-hidden bg-black">
              <img
                ref={imageRef}
                src={localUrl}
                alt="Screenshot with selected crop area"
                className="block max-h-[46vh] max-w-full opacity-50"
                onLoad={event => setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
              />
              {crop && imageSize && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.12)]"
                  style={{
                    left: `${crop.x / imageSize.width * 100}%`,
                    top: `${crop.y / imageSize.height * 100}%`,
                    width: `${crop.width / imageSize.width * 100}%`,
                    height: `${crop.height / imageSize.height * 100}%`,
                  }}
                />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="crop-zoom">Crop size</Label>
                <input
                  id="crop-zoom"
                  data-testid="input-crop-zoom"
                  type="range"
                  min="1.1"
                  max="4"
                  step="0.05"
                  value={zoom}
                  onChange={event => setZoom(Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crop-horizontal">Move horizontally</Label>
                <input
                  id="crop-horizontal"
                  data-testid="input-crop-horizontal"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={centerX}
                  onChange={event => setCenterX(Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crop-vertical">Move vertically</Label>
                <input
                  id="crop-vertical"
                  data-testid="input-crop-vertical"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={centerY}
                  onChange={event => setCenterY(Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>

            <label className="flex items-start gap-3 border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <input
                data-testid="checkbox-confirm-public-crop"
                type="checkbox"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                I checked the crop and removed private email text, browser chrome, notifications, and personal details.
                I understand this cropped region will be uploaded as a public image.
              </span>
            </label>
            {error && <p role="alert" data-testid="status-crop-error" className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button
            data-testid="button-cancel-crop"
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            data-testid="button-confirm-crop"
            type="button"
            disabled={!file || !imageSize || !confirmed || uploading}
            onClick={() => void createCrop()}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {uploading ? 'Uploading crop…' : `Use as ${field === 'cover' ? 'cover' : 'author photo'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}