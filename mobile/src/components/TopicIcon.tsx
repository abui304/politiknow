import type { ComponentProps } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { Chip } from './ui';

import { colors } from '@/theme';

/*
 * One line icon per official Library of Congress policy area, drawn on the same 24-unit grid with the same
 * 2-unit rounded stroke as the app's other icons (Feather), so they sit beside them without looking borrowed.
 * Each is a plain object, not a photo: nothing in them says anything about a side.
 */

type Shape = string | [number, number, number]; // a path, or a circle [cx, cy, r]

const ICONS: Record<string, Shape[]> = {
  'Agriculture and Food': [
    'M12 22V8',
    'M12 18c-3 0-4.5-1.7-4.5-4.2 3 0 4.5 1.7 4.5 4.2z',
    'M12 18c3 0 4.5-1.7 4.5-4.2-3 0-4.5 1.7-4.5 4.2z',
    'M12 12c-3 0-4.5-1.7-4.5-4.2 3 0 4.5 1.7 4.5 4.2z',
    'M12 12c3 0 4.5-1.7 4.5-4.2-3 0-4.5 1.7-4.5 4.2z',
    'M12 7c-1.2-1-1.2-3 0-4.5 1.2 1.5 1.2 3.5 0 4.5z',
  ],
  Animals: [
    'M12 21c-2.8 0-5-1.4-5-3.6 0-2.4 2.3-4.9 5-4.9s5 2.5 5 4.9c0 2.2-2.2 3.6-5 3.6z',
    [4, 10.5, 1.6],
    [8.5, 5, 1.6],
    [15.5, 5, 1.6],
    [20, 10.5, 1.6],
  ],
  'Armed Forces and National Security': ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M8.5 10.5L12 13l3.5-2.5', 'M8.5 14.5L12 17l3.5-2.5'],
  'Arts, Culture, Religion': [
    'M12 3a9 9 0 1 0 0 18c1.3 0 2-.8 2-1.8 0-1.3-1.2-1.7-1.2-2.8 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z',
    [7.5, 11, 1.2],
    [10, 7, 1.2],
    [15, 7, 1.2],
  ],
  'Civil Rights and Liberties, Minority Issues': ['M9 11h6l-1.2 11h-3.6z', 'M12 2c2.2 2 3.2 3.6 3.2 5.2a3.2 3.2 0 0 1-6.4 0C8.8 5.6 9.8 4 12 2z'],
  Commerce: ['M3 9l2-5h14l2 5', 'M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0', 'M5 11.5V21h14v-9.5', 'M10 21v-5h4v5'],
  Congress: ['M3 21h18', 'M5 21v-7h14v7', 'M6.5 14v-1a5.5 5.5 0 0 1 11 0v1', 'M12 7.5V3', 'M9 17v4', 'M12 17v4', 'M15 17v4'],
  'Crime and Law Enforcement': ['M12 2.5l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.3l-5.5 2.9 1.2-6.1-4.5-4.2 6.1-.8z'],
  'Economics and Public Finance': ['M3 3v18h18', 'M7 15l4-4.5 3 3L20 7', 'M16 7h4v4'],
  Education: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c3.5 2.5 8.5 2.5 12 0v-5', 'M22 9v6'],
  'Emergency Management': ['M6.5 18v-5.5a5.5 5.5 0 0 1 11 0V18', 'M4.5 21.5h15v-3.5h-15z', 'M12 2v2.5', 'M4 6l1.8 1.8', 'M20 6l-1.8 1.8'],
  Energy: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  'Environmental Protection': ['M4 20c0-9.5 6.5-15.5 16-16 0 9.5-6.5 15.5-16 16z', 'M4 20l9-9'],
  Families: [[7.5, 6.5, 2.5], [16.5, 6.5, 2.5], [12, 13, 2], 'M2.5 21v-2.5A5 5 0 0 1 7.5 13.5', 'M21.5 21v-2.5a5 5 0 0 0-5-5', 'M8 21v-.5a4 4 0 0 1 8 0v.5'],
  'Finance and Financial Sector': ['M3 9.5L12 4l9 5.5', 'M4 9.5h16', 'M6 12v6', 'M10 12v6', 'M14 12v6', 'M18 12v6', 'M3 21h18'],
  'Foreign Trade and International Finance': ['M2.5 15h19l-2.5 5h-14z', 'M6 15V9h5v6', 'M11 15v-4h5v4', 'M8.5 9V6'],
  'Geographic Areas, Entities, and Committees': ['M1.5 6v16l7-4 7 4 7-4V2l-7 4-7-4z', 'M8.5 2v16', 'M15.5 6v16'],
  'Government Operations and Politics': ['M3.5 12h17v9h-17z', 'M8 12V3.5h8V12', 'M10.5 8h3', 'M9.5 16.5h5'],
  Health: ['M20.4 4.6a5.4 5.4 0 0 0-7.6 0L12 5.4l-.8-.8a5.4 5.4 0 0 0-7.6 7.6l8.4 8.4 8.4-8.4a5.4 5.4 0 0 0 0-7.6z', 'M12 8.5v6', 'M9 11.5h6'],
  'Housing and Community Development': ['M3 11l9-7.5 9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  Immigration: ['M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H6z', [12.5, 10, 3.5], 'M9 17.5h7'],
  'International Affairs': [[12, 12, 9.5], 'M2.5 12h19', 'M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5S9.4 5.2 12 2.5z'],
  'Labor and Employment': ['M2.5 18.5h19', 'M4.5 18.5V15a7.5 7.5 0 0 1 15 0v3.5', 'M10 8V4.5h4V8', 'M12 8v5'],
  Law: ['M12 3v17', 'M7 21h10', 'M4.5 7h15', 'M4.5 7L2 13.5a2.5 2.5 0 0 0 5 0z', 'M19.5 7L17 13.5a2.5 2.5 0 0 0 5 0z'],
  'Native Americans': ['M20.2 12.2a6 6 0 0 0-8.4-8.4L5 10.5V19h8.5z', 'M16 8L2 22', 'M17.5 15H9'],
  'Private Legislation': [[12, 7.5, 4], 'M4 21a8 8 0 0 1 16 0'],
  'Public Lands and Natural Resources': ['M2 20l6.5-11 4 6.5 2.5-3.5 7 8z', [17.5, 5.5, 2]],
  'Science, Technology, Communications': ['M9 2.5h6', 'M10 2.5v6.5L4.8 18.2A2 2 0 0 0 6.5 21.5h11a2 2 0 0 0 1.7-3.3L14 9V2.5', 'M7 15h10'],
  'Social Sciences and History': ['M6.5 2.5h11v4L12 12 6.5 6.5z', 'M6.5 21.5h11v-4L12 12l-5.5 5.5z'],
  'Social Welfare': ['M2.5 16.5h3.5l4 3h6.5l5-4', 'M12 12.5L8.9 9.6a2.1 2.1 0 0 1 3.1-2.9 2.1 2.1 0 0 1 3.1 2.9z'],
  'Sports and Recreation': [[12, 12, 9.5], 'M2.5 12h19', 'M12 2.5v19', 'M5.3 5.3c3.6 3.6 3.6 9.8 0 13.4', 'M18.7 5.3c-3.6 3.6-3.6 9.8 0 13.4'],
  Taxation: ['M5 2.5v19l2.3-1.6 2.3 1.6 2.4-1.6 2.4 1.6 2.3-1.6 2.3 1.6v-19l-2.3 1.6-2.3-1.6-2.4 1.6-2.4-1.6-2.3 1.6z', 'M9 15l6-6', [9.5, 9.5, 0.8], [14.5, 14.5, 0.8]],
  'Transportation and Public Works': ['M2 18.5h20', 'M5 18.5V11', 'M19 18.5V11', 'M2.5 10.5c4 0 6.2-4 9.5-4s5.5 4 9.5 4', 'M9 18.5v-4.5', 'M15 18.5v-4.5'],
  'Water Resources Development': ['M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z', 'M8 14.5c1.3 1 2.7 1 4 0s2.7-1 4 0'],
};

/** The topic's line icon, or a plain tag for anything not in the official list. */
export function TopicIcon({ topic, size = 16, color = colors.inkSoft }: { topic: string; size?: number; color?: string }) {
  const shapes = ICONS[topic] ?? ['M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z', [7, 7, 1]];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {shapes.map((s, i) => (typeof s === 'string' ? <Path key={i} d={s} /> : <Circle key={i} cx={s[0]} cy={s[1]} r={s[2]} />))}
    </Svg>
  );
}

export const TOPICS_WITH_ICONS = Object.keys(ICONS);

/** A topic chip: the topic's icon, then its name. Same props as Chip. */
export function TopicChip(props: Omit<ComponentProps<typeof Chip>, 'leading'>) {
  return <Chip {...props} leading={(color) => <TopicIcon topic={props.label} size={props.small ? 13 : 15} color={color} />} />;
}
