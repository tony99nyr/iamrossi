import { Metadata } from 'next';
import InstagramClient from './InstagramClient';
import { getAllInstagramPosts, getAllInstagramLabels } from '@/lib/kv';

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

export default async function InstagramPage() {
  // Fetch initial data
  const posts = await getAllInstagramPosts();
  const labels = await getAllInstagramLabels();

  // Filter out archived posts by default
  const activePosts = posts.filter(p => !(p.archived ?? false));

  return (
    <InstagramClient
      initialPosts={activePosts}
      initialLabels={labels}
    />
  );
}

