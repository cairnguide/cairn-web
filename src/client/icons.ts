/**
 * Icon shapes, copied from the Cairn MVP wireframes (24x24, 2px stroke).
 * Decorative only: every icon is aria-hidden and sits next to visible text.
 */
import type { IconShape } from './dom.ts';

export const icons = {
  textSize: [{ path: 'M3 19l5-13 5 13M4.8 14.5h6.4M14 19l3.5-9 3.5 9M15 16.5h5' }],
  speaker: [
    { path: 'M4 9v6h4l5 4V5L8 9Z' },
    { path: 'M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11' },
  ],
  help: [
    { circle: [12, 12, 9] },
    { path: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.01' },
  ],
  mail: [{ rect: [3, 5, 18, 14, 2] }, { path: 'M3 7l9 6 9-6' }],
  noCard: [{ rect: [3, 6, 18, 12, 2] }, { path: 'M3 10h18M4 4l16 16' }],
  shield: [{ path: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z' }, { path: 'M9 12l2 2 4-4' }],
  trash: [{ path: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13' }],
  info: [{ circle: [12, 12, 9] }, { path: 'M12 11v5M12 8v.01' }],
  phone: [
    {
      path: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z',
    },
  ],
  stepCurrent: [{ circle: [12, 12, 9] }, { circle: [12, 12, 4], fill: true }],
  stepTodo: [{ circle: [12, 12, 9] }],
  stepDone: [{ circle: [12, 12, 9] }, { path: 'M8 12.5l2.8 2.8L16.5 9.5' }],
  warning: [{ path: 'M12 3l9.5 17h-19Z' }, { path: 'M12 10v4M12 17v.01' }],
  eye: [{ path: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z' }, { circle: [12, 12, 3] }],
  arrowRight: [{ path: 'M5 12h14M13 6l6 6-6 6' }],
  external: [
    { path: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' },
  ],
  mic: [{ rect: [9, 3, 6, 11, 3] }, { path: 'M5 11a7 7 0 0 0 14 0M12 18v3' }],
  stop: [{ rect: [6, 6, 12, 12, 2] }],
  heart: [{ path: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z' }],
  settings: [
    { circle: [12, 12, 3] },
    {
      path: 'M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
    },
  ],
  home: [{ path: 'M3 11l9-7 9 7M5 10v10h14V10' }],
  calendar: [{ rect: [3, 5, 18, 16, 2] }, { path: 'M3 10h18M8 3v4M16 3v4' }],
  edit: [{ path: 'M4 20h4L19 9l-4-4L4 16Z' }],
  arrowLeft: [{ path: 'M19 12H5M11 6l-6 6 6 6' }],
  scale: [{ path: 'M12 4v16M7 20h10M5 7h14M8 7l-3 6h6ZM16 7l-3 6h6Z' }],
  partial: [{ circle: [12, 12, 9] }, { path: 'M12 3a9 9 0 0 1 0 18Z' }],
  minus: [{ circle: [12, 12, 9] }, { path: 'M8 12h8' }],
  pause: [{ rect: [6, 5, 4, 14, 1] }, { rect: [14, 5, 4, 14, 1] }],
} satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof icons;
