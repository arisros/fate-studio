import type { ReactNode } from "react";

const circle = (r: number, cx = 8, cy = 8) => <circle cx={cx} cy={cy} r={r} />;

const paths = {
  undo: <path d="M6 3 3 6l3 3M3 6h6.5a3.5 3.5 0 0 1 0 7H7" />,
  reset: <path d="M3.5 5.6A5.2 5.2 0 1 1 2.8 9M3 2.4v3.4h3.4" />,
  import: <path d="M8 10V2.5M5 5.5l3-3 3 3M2.5 10.5V13h11v-2.5" />,
  export: <path d="M8 2.5V10M5 7l3 3 3-3M2.5 10.5V13h11v-2.5" />,
  sun: (
    <>
      {circle(2.8)}
      <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </>
  ),
  moon: <path d="M13 9.6A5.5 5.5 0 1 1 6.4 3 4.3 4.3 0 0 0 13 9.6Z" />,
  play: <path d="M5 3.2 12.5 8 5 12.8Z" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  "chevron-down": <path d="m4 6 4 4 4-4" />,
  "chevron-right": <path d="m6 4 4 4-4 4" />,
  warning: <path d="M8 2.5 14 13H2ZM8 6.5v3M8 11.3v.1" />,
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-.9" />
    </>
  ),
  help: (
    <>
      {circle(5.5)}
      <path d="M6.3 6.4A1.8 1.8 0 1 1 8 8.4v.8M8 11.2v.1" />
    </>
  ),
  branch: <path d="M2.5 8H6c2 0 2-4 4-4h3.5M6 8c2 0 2 4 4 4h3.5" />,
  "arrow-right": <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />,
  loop: <path d="M12.5 10.4A5.2 5.2 0 1 1 13.2 7M13 13.6v-3.4H9.6" />,
  enter: <path d="M13 3.5V8a1.5 1.5 0 0 1-1.5 1.5h-8M6 7 3.5 9.5 6 12" />,
  global: (
    <>
      {circle(5.5)}
      <path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" />
    </>
  ),
  parallel: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M8 2.5v11M2.5 8h11" />
    </>
  ),
  clock: (
    <>
      {circle(5.5)}
      <path d="M8 5v3l2 1.5" />
    </>
  ),
  bolt: <path d="M9 2 4 9h4l-1 5 5-7H8Z" />,
  search: (
    <>
      {circle(4, 7, 7)}
      <path d="m10 10 3.5 3.5" />
    </>
  ),
  check: <path d="m3.5 8.5 3 3 6-6.5" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </>
  ),
  layout: <path d="M2.5 3H7v4H2.5ZM9 9h4.5v4H9ZM7 5h4.2v4" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 14, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function gateIcon(anyClosed: boolean, allOpen: boolean): IconName {
  return anyClosed ? "lock" : allOpen ? "unlock" : "help";
}
