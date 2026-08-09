import type { Metadata } from 'next';
import ImportPanel from './ImportPanel';

export const metadata: Metadata = {
    title: 'Import from Kubernetes',
    description: 'Paste a Deployment YAML or kubectl describe output — jvm.expert extracts the memory limit and JVM flags and routes them into the flags audit and the calculator.',
    alternates: { canonical: '/import' },
};

export default function ImportPage() {
    return <ImportPanel />;
}
