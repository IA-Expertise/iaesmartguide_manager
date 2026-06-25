interface IconProps {
  className?: string;
  size?: number;
}

export function IconMapPin({ className, size = 20 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function IconGallery({ className, size = 20 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="8.5" cy="10" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="m21 16-5.5-5L9 17" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBag({ className, size = 20 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 8h12l-1.2 11H7.2L6 8Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9 8V6a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPlay({ className, size = 20 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
      <path d="m10 8.5 6 3.5-6 3.5V8.5Z" fill="currentColor" />
    </svg>
  );
}

export function IconSpark({ className, size = 16 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.4 5.6L19 9l-5.6 1.4L12 16l-1.4-5.6L5 9l5.6-1.4L12 2Z" />
    </svg>
  );
}
