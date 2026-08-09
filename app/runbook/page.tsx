import type { Metadata } from 'next';
import RunbookChecklist from './RunbookChecklist';

export const metadata: Metadata = {
    title: 'OOMKilled Runbook',
    description: 'An interactive incident checklist for OOMKilled Java pods: six steps from kernel-vs-JVM triage to the measured fix, each wired to the right tool.',
    alternates: { canonical: '/runbook' },
};

export default function RunbookPage() {
    return <RunbookChecklist />;
}
