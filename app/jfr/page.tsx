import type { Metadata } from 'next';
import JfrAnalyzer from './JfrAnalyzer';

export const metadata: Metadata = {
    title: 'JFR Analyzer',
    description: 'Inspect a Flight Recorder file in the browser and turn jfr print output (GC heap summaries, native memory usage) into a live-set-based heap recommendation.',
    alternates: { canonical: '/jfr' },
};

export default function JfrPage() {
    return <JfrAnalyzer />;
}
