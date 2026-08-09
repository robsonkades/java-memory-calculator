import type { Metadata } from 'next';
import StartWizard from './StartWizard';

export const metadata: Metadata = {
    title: 'Start Here',
    description: 'Answer two questions and land on the right JVM sizing tool — calculator, flags audit, NMT, GC log, JFR or thread dump analyzer.',
    alternates: { canonical: '/start' },
};

export default function StartPage() {
    return <StartWizard />;
}
