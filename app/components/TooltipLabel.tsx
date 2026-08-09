'use client'
import { useRef, useState, type ReactNode } from 'react';

const TOOLTIP_WIDTH = 256; // keep in sync with w-64
const VIEWPORT_MARGIN = 8;

export default function TooltipLabel({ text, tooltip }: Readonly<{
    text: ReactNode;
    tooltip: string;
}>) {
    const triggerRef = useRef<HTMLSpanElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

    // Fixed positioning measured from the trigger: escapes overflow-x-auto
    // containers (which clip absolute children), clamps to the viewport and
    // flips above the trigger near the bottom edge.
    const show = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN);
        const above = rect.bottom + 180 > window.innerHeight && rect.top > 200;
        setPos({ top: above ? rect.top - 6 : rect.bottom + 6, left, above });
    };
    const hide = () => setPos(null);

    return (
        <span
            ref={triggerRef}
            tabIndex={0}
            className="inline-block cursor-help underline decoration-dotted decoration-muted underline-offset-4 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            {text}
            {pos && (
                <span
                    role="tooltip"
                    className="fixed z-50 w-64 rounded-md bg-foreground text-background text-xs leading-relaxed py-2 px-3 shadow-md"
                    style={{ top: pos.top, left: pos.left, transform: pos.above ? 'translateY(-100%)' : undefined }}
                >
                    {tooltip}
                </span>
            )}
        </span>
    );
}
