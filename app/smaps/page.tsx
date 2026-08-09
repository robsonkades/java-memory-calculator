import type { Metadata } from 'next';
import SmapsAnalyzer from './SmapsAnalyzer';

export const metadata: Metadata = {
    title: 'Smaps Analyzer',
    description: 'Paste /proc/<pid>/smaps, smaps_rollup or pmap -x output and see where the container RSS actually lives — heap, mapped JARs, stacks and the glibc malloc arena signature.',
    alternates: { canonical: '/smaps' },
};

export default function SmapsPage() {
    return <SmapsAnalyzer />;
}
