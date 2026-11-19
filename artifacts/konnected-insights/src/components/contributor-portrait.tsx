interface ContributorPortraitProps {
  name: string;
  image?: string;
  isPlaceholder?: boolean;
  className?: string;
  imageClassName?: string;
}

export function ContributorPortrait({
  name,
  image,
  isPlaceholder = false,
  className = '',
  imageClassName = '',
}: ContributorPortraitProps) {
  return (
    <div
      className={`relative isolate overflow-hidden aspect-[4/5] bg-transparent ${className}`}
    >
      {image ? (
        <img
          src={image}
          alt={name}
          className={`absolute inset-0 z-10 h-full w-full object-contain object-bottom drop-shadow-[0_12px_18px_rgba(50,34,80,0.12)] transition-transform duration-700 ease-out ${imageClassName}`}
        />
      ) : (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-end overflow-hidden"
          role="img"
          aria-label={`${name} portrait not yet available`}
        >
          <div className="mb-[-1%] h-[29%] aspect-square rounded-full bg-gradient-to-br from-[#b7aac8] to-[#8f7da7]" />
          <div className="h-[47%] w-[76%] rounded-t-[50%] bg-gradient-to-br from-[#b7aac8] via-[#a293b6] to-[#817094]" />
        </div>
      )}
    </div>
  );
}