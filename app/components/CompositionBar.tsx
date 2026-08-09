export interface CompositionSegment {
    label: string;
    value: number;
}

// Static class names so Tailwind can extract them; index = fixed palette slot.
const CHART_BG = [
    'bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4',
    'bg-chart-5', 'bg-chart-6', 'bg-chart-7', 'bg-chart-8',
];

/**
 * Horizontal stacked composition bar. Colors follow the segment's position in
 * the input array (the entity), not its position among the visible segments,
 * so a zero-valued segment never repaints its neighbors.
 */
export default function CompositionBar({ segments, unit = 'Mi' }: Readonly<{
    segments: CompositionSegment[];
    unit?: string;
}>) {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const visible = segments
        .map((s, slot) => ({ ...s, slot }))
        .filter((s) => s.value > 0);
    if (total <= 0) return null;
    return (
        <div>
            <div className="flex h-8 gap-0.5" aria-hidden="true">
                {visible.map((s, i) => (
                    <div
                        key={s.label}
                        className={`group relative ${CHART_BG[s.slot]}
                            ${i === 0 ? 'rounded-l' : ''} ${i === visible.length - 1 ? 'rounded-r' : ''}`}
                        style={{ width: `${(s.value / total) * 100}%` }}
                    >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 whitespace-nowrap rounded-md bg-foreground text-background px-2 py-1 text-xs">
                            {s.label} · {s.value} {unit} ({Math.round((s.value / total) * 100)}%)
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                {segments.map((s, slot) => (
                    <div key={s.label} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CHART_BG[slot]}`} aria-hidden="true" />
                        <span className="text-secondary">{s.label}</span>
                        <span className="ml-auto font-mono tabular-nums">{s.value} {unit}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
