import type { Metadata } from 'next';
import HistogramAnalyzer from './HistogramAnalyzer';

export const metadata: Metadata = {
    title: 'Heap Histogram Analyzer',
    description: 'Paste a jcmd GC.class_histogram / jmap -histo output and see the top heap consumers plus an estimate of Compact Object Headers savings.',
    alternates: { canonical: '/histogram' },
};

export default function HistogramPage() {
    return <HistogramAnalyzer />;
}
