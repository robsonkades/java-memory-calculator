import type { Metadata } from 'next';
import DiagnosePanel from './DiagnosePanel';

export const metadata: Metadata = {
    title: 'Diagnosis Session',
    description: 'Paste the outputs the collect script gathered — NMT, smaps, thread dump, histogram, GC log — and get the cross-checks no single analyzer can produce, plus a ticket-ready report.',
    alternates: { canonical: '/diagnose' },
};

export default function DiagnosePage() {
    return <DiagnosePanel />;
}
