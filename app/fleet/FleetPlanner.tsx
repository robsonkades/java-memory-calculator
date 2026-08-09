'use client'
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
    containerTotalFromQuery,
    decodeFleet,
    encodeFleet,
    parseScenarios,
    type FleetRow,
    type Scenario,
} from '@/lib/scenarios';
import { useT } from '@/lib/i18n';

const SCENARIOS_STORAGE_KEY = 'jvm-expert-scenarios';

interface ManualRow {
    name: string;
    limitMi: number;
}

export default function FleetPlanner() {
    const searchParams = useSearchParams();
    const fleetParam = searchParams.get('fleet');
    // A shared link is a self-contained fleet: it replaces the local scenarios
    // as the source, so the viewer sees exactly what the sender saw.
    const shared = fleetParam !== null ? decodeFleet(fleetParam) : null;

    const [scenarios] = useState<Scenario[]>(() =>
        shared !== null || typeof window === 'undefined'
            ? []
            : parseScenarios(window.localStorage.getItem(SCENARIOS_STORAGE_KEY)));
    const [manualRows, setManualRows] = useState<ManualRow[]>(() =>
        shared === null
            ? []
            : shared.filter((r) => r.limitMi !== undefined).map((r) => ({ name: r.name, limitMi: r.limitMi! })));
    const [manualName, setManualName] = useState('');
    const [manualLimit, setManualLimit] = useState(0);
    const [linkCopied, setLinkCopied] = useState(false);
    const t = useT();

    const queryRows = shared !== null
        ? shared.filter((r) => r.query !== undefined).map((r) => ({ name: r.name, query: r.query! }))
        : [...scenarios].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ name: s.name, query: s.query }));

    const addManualRow = () => {
        const name = manualName.trim();
        if (name === '' || manualLimit <= 0) return;
        setManualRows((prev) => [...prev.filter((r) => r.name !== name), { name, limitMi: manualLimit }]);
        setManualName('');
        setManualLimit(0);
    };
    const removeManualRow = (name: string) => {
        setManualRows((prev) => prev.filter((r) => r.name !== name));
    };

    const copyFleetLink = () => {
        const rows: FleetRow[] = [
            ...queryRows.map((r) => ({ name: r.name, query: r.query })),
            ...manualRows.map((r) => ({ name: r.name, limitMi: r.limitMi })),
        ];
        const url = `${window.location.origin}/fleet?fleet=${encodeFleet(rows)}`;
        navigator.clipboard.writeText(url)
            .then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 3000);
            })
            .catch(err => {
                console.error('Failed to copy fleet link: ', err);
            });
    };

    const computedRows = queryRows.map((r) => ({ ...r, limitMi: containerTotalFromQuery(r.query) }));
    const totalMi = computedRows.reduce((sum, r) => sum + (r.limitMi ?? 0), 0)
        + manualRows.reduce((sum, r) => sum + r.limitMi, 0);
    const hasRows = computedRows.length > 0 || manualRows.length > 0;

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('fleet.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('fleet.intro1')}{' '}
                        <Link href="/" className="text-accent hover:underline">{t('fleet.calculatorLink')}</Link>{' '}
                        {t('fleet.intro2')}
                    </p>
                </div>

                {shared !== null && (
                    <div className="mb-4 rounded-lg border p-3 text-sm text-secondary">
                        <span className="font-medium text-foreground">{t('fleet.sharedTitle')}</span> {t('fleet.shared2')}{' '}
                        <Link href="/fleet" className="text-accent hover:underline">{t('fleet.switchMine')}</Link>
                    </div>
                )}
                {fleetParam !== null && shared === null && (
                    <div className="mb-4 rounded-lg border border-red-600/40 bg-red-500/5 p-3 text-sm">
                        {t('fleet.invalid')}{' '}
                        <Link href="/fleet" className="text-accent hover:underline">{t('fleet.openMine')}</Link>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-sm mb-4">
                    <input
                        type="text"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder={t('fleet.namePh')}
                        className="h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                    <input
                        type="number"
                        value={manualLimit || ''}
                        onChange={(e) => setManualLimit(Number(e.target.value) || 0)}
                        placeholder={t('fleet.limitPh')}
                        className="w-28 h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                    <button
                        onClick={addManualRow}
                        className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        {t('fleet.addBtn')}
                    </button>
                    {hasRows && (
                        <button
                            onClick={copyFleetLink}
                            className="h-9 px-4 rounded-md border text-sm font-medium hover:bg-surface transition-colors"
                            title={t('fleet.copyLinkTitle')}
                        >
                            {t('fleet.copyLinkBtn')}
                        </button>
                    )}
                    {linkCopied && (
                        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
                            {t('fleet.linkCopied')}
                        </div>
                    )}
                </div>

                {!hasRows ? (
                    <p className="text-sm text-secondary">
                        {t('fleet.empty')}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b [&>th]:font-medium">
                                    <th className="py-2 pr-4">{t('fleet.thService')}</th>
                                    <th className="py-2 pr-4">{t('fleet.thSource')}</th>
                                    <th className="py-2 text-right">{t('fleet.thLimit')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {computedRows.map((row) => (
                                    <tr key={`s-${row.name}`} className="border-b">
                                        <td className="py-2 pr-4">
                                            <a href={`/?${row.query}`} className="text-accent hover:underline">
                                                {row.name}
                                            </a>
                                        </td>
                                        <td className="py-2 pr-4 text-secondary">{shared !== null ? t('fleet.srcShared') : t('fleet.srcSaved')}</td>
                                        <td className="py-2 text-right font-mono">{row.limitMi ?? t('fleet.infeasible')}</td>
                                    </tr>
                                ))}
                                {manualRows.map((row) => (
                                    <tr key={`m-${row.name}`} className="border-b">
                                        <td className="py-2 pr-4">{row.name}</td>
                                        <td className="py-2 pr-4 text-secondary">
                                            {t('fleet.srcManual')}{' '}
                                            <button
                                                onClick={() => removeManualRow(row.name)}
                                                className="text-red-600 dark:text-red-400 hover:underline ml-2"
                                            >
                                                {t('fleet.remove')}
                                            </button>
                                        </td>
                                        <td className="py-2 text-right font-mono">{row.limitMi}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-medium">
                                    <td className="py-2 pr-4">{t('fleet.total')}</td>
                                    <td className="py-2 pr-4"></td>
                                    <td className="py-2 text-right font-mono">
                                        {totalMi} Mi ({(totalMi / 1024).toFixed(2)} GiB)
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
