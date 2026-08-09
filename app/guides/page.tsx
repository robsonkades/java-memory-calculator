import type { Metadata } from 'next';
import Link from 'next/link';
import { guides } from '@/lib/guides';
import LocaleNote from './LocaleNote';

export const metadata: Metadata = {
    title: 'Guides',
    description: 'Practical guides on JVM memory sizing, garbage collector choice and native memory diagnostics for containerized Java applications.',
    alternates: { canonical: '/guides' },
};

const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'JVM Expert Guides',
    itemListElement: guides.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: guide.title,
        url: `https://jvm.expert/guides/${guide.slug}`,
    })),
};

export default function GuidesPage() {
    return (
        <div>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
            />
            <h1 className="text-2xl font-semibold tracking-tight mb-6">Guides</h1>
            <LocaleNote />
            <div className="space-y-4">
                {guides.map((guide) => (
                    <Link
                        key={guide.slug}
                        href={`/guides/${guide.slug}`}
                        className="block rounded-lg border p-5 hover:bg-surface transition-colors"
                    >
                        <h2 className="text-lg font-medium tracking-tight">{guide.title}</h2>
                        <p className="text-sm text-secondary mt-1">{guide.description}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
