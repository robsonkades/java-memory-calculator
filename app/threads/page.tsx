import type { Metadata } from 'next';
import ThreadDumpAnalyzer from './ThreadDumpAnalyzer';

export const metadata: Metadata = {
    title: 'Thread Dump Analyzer',
    description: 'Paste a jstack thread dump and get counts by state and pool, plus the stack memory implication for container sizing.',
    alternates: { canonical: '/threads' },
};

export default function ThreadsPage() {
    return <ThreadDumpAnalyzer />;
}
