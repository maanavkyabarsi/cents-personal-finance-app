import type { SVGProps } from "react";
import type { IconKey } from "@/lib/categories";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const ChartPie = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
    <path d="M12 3v9h9a9 9 0 0 0-9-9Z" opacity={0.45} />
  </svg>
);
export const Layers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" opacity={0.55} />
  </svg>
);
export const Target = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </svg>
);
export const Wallet = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1H5a2 2 0 0 0-2 2V7Z" />
    <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
    <circle cx="16.5" cy="13" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
export const TrendUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4 15 5-5 4 4 7-7" />
    <path d="M16 7h4v4" />
  </svg>
);
export const TrendDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4 9 5 5 4-4 7 7" />
    <path d="M16 17h4v-4" />
  </svg>
);
export const Sun = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </svg>
);
export const Moon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12.8A8 8 0 1 1 11.2 3a6 6 0 0 0 9.8 9.8Z" />
  </svg>
);
export const Refresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v4h-4" />
  </svg>
);
export const Close = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const Check = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m5 13 4 4L19 7" />
  </svg>
);
export const Alert = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);
export const Search = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const Inbox = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 13h4l1.5 3h7L17 13h4" />
    <path d="M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4l2-8Z" />
  </svg>
);
export const Leaf = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 14C4 7 10 3 19 3C19 12 15 18 8 18C6.5 18 5 17.5 4 17" />
    <path d="M4 20C6 17 9 15 12 14" />
  </svg>
);
export const RingMark = ({ size = 22, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="-3.3 -3.3 46.6 46.6"
    fill="none"
    {...props}
  >
    <path
      d="M 18.69,5.06 A 15,15 0 1 1 5.51,16.12"
      stroke="currentColor"
      strokeWidth={4.6}
      strokeLinecap="round"
    />
  </svg>
);
export const Grid = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
export const ListLines = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);
export const Clock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </svg>
);
export const Home = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    <path d="M10 20v-5h4v5" />
  </svg>
);
export const Receipt = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3Z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);
export const Filter = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />
  </svg>
);
export const ChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const Plus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Crown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 8l4 4 5-7 5 7 4-4-1.5 11h-15L3 8Z" />
    <path d="M5 21h14" />
  </svg>
);

const CategoryGlyphs: Record<IconKey, (p: IconProps) => React.ReactElement> = {
  food: (p) => (
    <svg {...base(p)}>
      <path d="M5 3v7a2 2 0 0 0 4 0V3M7 3v18M17 3c-1.5 0-3 1.5-3 4s1.5 4 3 4v8" />
    </svg>
  ),
  cart: (p) => (
    <svg {...base(p)}>
      <circle cx="9" cy="20" r="1.3" />
      <circle cx="18" cy="20" r="1.3" />
      <path d="M3 4h2l2.2 11.2a1 1 0 0 0 1 .8h8.4a1 1 0 0 0 1-.8L21 8H6" />
    </svg>
  ),
  car: (p) => (
    <svg {...base(p)}>
      <path d="M4 13l1.5-4.5A2 2 0 0 1 7.4 7h9.2a2 2 0 0 1 1.9 1.5L20 13" />
      <path d="M3 13h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z" />
      <path d="M7 16h.01M17 16h.01" />
    </svg>
  ),
  home: (p) => (
    <svg {...base(p)}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
  bolt: (p) => (
    <svg {...base(p)}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  ),
  plane: (p) => (
    <svg {...base(p)}>
      <path d="M10.5 13.5 3 11l1-2 6 1 4.5-5a1.8 1.8 0 0 1 2.6 2.6L12 12l1 6-2 1-2.5-7.5Z" />
    </svg>
  ),
  film: (p) => (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </svg>
  ),
  heart: (p) => (
    <svg {...base(p)}>
      <path d="M12 20s-7-4.3-7-9.3A3.7 3.7 0 0 1 12 7a3.7 3.7 0 0 1 7 3.7C19 15.7 12 20 12 20Z" />
      <path d="M12 9v4M10 11h4" />
    </svg>
  ),
  sparkles: (p) => (
    <svg {...base(p)}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
    </svg>
  ),
  wrench: (p) => (
    <svg {...base(p)}>
      <path d="M15 7a4 4 0 0 1-5.2 5.2L5 17l2 2 4.8-4.8A4 4 0 0 0 17 9l-2.5-.5L13 6l2-1Z" opacity={0.9} />
      <path d="M14.7 6.3 19 2l1 1-1 4-2 2-3-3 .7-.4Z" />
    </svg>
  ),
  bank: (p) => (
    <svg {...base(p)}>
      <path d="M4 9 12 4l8 5M5 9h14M6 9v8M10 9v8M14 9v8M18 9v8M4 20h16" />
    </svg>
  ),
  gift: (p) => (
    <svg {...base(p)}>
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M4 13h16M12 9v11M9 9a2 2 0 1 1 3-2.5A2 2 0 1 1 15 9" />
    </svg>
  ),
  scale: (p) => (
    <svg {...base(p)}>
      <path d="M12 4v16M7 20h10M5 8h14M5 8l-2 5a3 3 0 0 0 6 0L5 8Zm14 0-2 5a3 3 0 0 0 6 0l-4-5Z" />
    </svg>
  ),
  briefcase: (p) => (
    <svg {...base(p)}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </svg>
  ),
  arrowDown: (p) => (
    <svg {...base(p)}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  ),
  arrowUp: (p) => (
    <svg {...base(p)}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  ),
  tag: (p) => (
    <svg {...base(p)}>
      <path d="M3 12V4h8l9 9-8 8-9-9Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  ),
};

export function CategoryIcon({
  iconKey,
  ...props
}: IconProps & { iconKey: IconKey }) {
  return CategoryGlyphs[iconKey](props);
}
