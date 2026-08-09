import type { Metadata } from 'next';
import GlossaryList from './GlossaryList';

export const metadata: Metadata = {
    title: 'Glossary',
    description: 'The JVM memory vocabulary in one page: reserved vs committed, RSS, metaspace, code cache, direct memory, NMT, cgroup limits, OOMKilled and more.',
    alternates: { canonical: '/glossary' },
};

export default function GlossaryPage() {
    return (
        <div className="px-4 py-8 max-w-3xl mx-auto">
            <GlossaryList />
        </div>
    );
}
