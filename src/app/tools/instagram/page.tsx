import { Suspense } from 'react';
import type { Metadata } from 'next';
import InstagramClient from './InstagramClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Instagram Saved Posts | iamrossi.com',
  description: 'Browse and organize your saved Instagram posts',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  other: {
    'ai-robots': 'noindex, noimageai',
  },
};

export default function InstagramPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InstagramClient initialPosts={[]} initialLabels={[]} />
    </Suspense>
  );
}

