import type { Metadata } from 'next';
import NmtAnalyzer from './NmtAnalyzer';

export const metadata: Metadata = {
    title: 'NMT Analyzer',
    description: 'Paste the output of jcmd VM.native_memory summary and get a measured breakdown of your JVM\'s native memory plus a container limit recommendation.',
    alternates: { canonical: '/nmt' },
};

export default function NmtPage() {
    return <NmtAnalyzer />;
}
