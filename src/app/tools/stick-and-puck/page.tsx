import { Metadata } from 'next';
import StickAndPuckClient from './StickAndPuckClient';
import { getStickAndPuckSessions } from '@/lib/kv';
import type { StickAndPuckSession } from '@/types';

// Force dynamic rendering since we're reading from KV
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stick & Puck Finder | iamrossi.com',
  description: 'Find open hockey sessions at Polar Ice rinks around town. View all stick and puck sessions in a calendar view.',
  openGraph: {
    title: 'Stick & Puck Finder',
    description: 'Find open hockey sessions at Polar Ice rinks around town.',
    url: 'https://iamrossi.com/tools/stick-and-puck',
    siteName: 'iamrossi.com',
    type: 'website',
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  other: {
    'ai-robots': 'noindex, noimageai',
  }
};

export default async function StickAndPuckPage() {
  let sessions: StickAndPuckSession[] = [];
  
  try {
    sessions = await getStickAndPuckSessions();
  } catch (error) {
    console.error('[Stick and Puck Page] Failed to load sessions from KV:', error);
  }

  return <StickAndPuckClient initialSessions={sessions} />;
}

