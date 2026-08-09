import type { Metadata } from 'next';
import { Suspense } from 'react';
import FleetPlanner from './FleetPlanner';

export const metadata: Metadata = {
    title: 'Fleet Planner',
    description: 'Sum the container memory limits of a whole fleet of JVM services — from scenarios saved in the calculator plus manual entries.',
    alternates: { canonical: '/fleet' },
};

export default function FleetPage() {
    return (
        <Suspense>
            <FleetPlanner />
        </Suspense>
    );
}
