import type { ComponentProps } from 'react';

export function OptionalExternalLink({ href, children, ...props }: ComponentProps<'a'>) {
  return href?.trim() ? <a href={href} {...props}>{children}</a> : <div className={props.className}>{children}</div>;
}