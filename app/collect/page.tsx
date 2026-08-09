import type { Metadata } from 'next';
import CollectPanel from './CollectPanel';

export const metadata: Metadata = {
    title: 'Diagnostics Collector',
    description: 'Generate a ready-to-run shell script that captures NMT, class histogram, thread dump and smaps from a running JVM container — each file pastes straight into a jvm.expert analyzer.',
    alternates: { canonical: '/collect' },
};

export default function CollectPage() {
    return <CollectPanel />;
}
