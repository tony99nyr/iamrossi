import { Metadata } from 'next';
import { getPokemonIndexSettings, getPokemonIndexSeries } from '@/lib/kv';
import PokemonPriceIndexClient from './PokemonPriceIndexClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Pokemon Card Price Index | iamrossi.com',
    description: 'Track a custom index of Pokemon card prices over time with moving averages.',
    openGraph: {
        title: 'Pokemon Card Price Index',
        description: 'Analyze trends for a custom basket of Pokemon cards using an index with moving averages.',
        url: 'https://iamrossi.com/tools/pokemon-price-index',
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
    },
};

export default async function PokemonPriceIndexPage() {
    const settings = await getPokemonIndexSettings();
    const series = await getPokemonIndexSeries();

    return (
        <PokemonPriceIndexClient
            initialSettings={settings}
            initialSeries={series}
        />
    );
}



