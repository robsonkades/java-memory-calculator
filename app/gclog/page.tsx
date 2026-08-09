import type { Metadata } from 'next';
import GcLogAnalyzer from './GcLogAnalyzer';

export const metadata: Metadata = {
    title: 'GC Log Analyzer',
    description: 'Paste a JDK unified GC log (-Xlog:gc) and get pause statistics, throughput, an allocation-rate estimate and a live-set-based heap recommendation.',
    alternates: { canonical: '/gclog' },
};

export default function GcLogPage() {
    return <GcLogAnalyzer />;
}
