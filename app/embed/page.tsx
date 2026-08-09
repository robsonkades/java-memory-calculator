import type { Metadata } from 'next';
import { Suspense } from 'react';
import EmbedCard from './EmbedCard';

export const metadata: Metadata = {
    title: 'Embed',
    description: 'Compact, iframe-friendly view of a JVM memory sizing.',
    robots: { index: false },
};

export default function EmbedPage() {
    return (
        <Suspense>
            <EmbedCard />
        </Suspense>
    );
}
