import type { Metadata } from 'next';
import { Suspense } from 'react';
import FlagsAuditor from './FlagsAuditor';

export const metadata: Metadata = {
    title: 'Flags Audit',
    description: 'Paste the JVM flags your service runs with and get an audit for container deployments — removed flags, unsafe defaults, redundant options, missing hygiene — plus a corrected line for your Java version.',
    alternates: { canonical: '/flags' },
};

export default function FlagsPage() {
    return (
        <Suspense>
            <FlagsAuditor />
        </Suspense>
    );
}
