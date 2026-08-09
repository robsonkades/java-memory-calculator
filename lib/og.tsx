import { ImageResponse } from 'next/og';

export const ogSize = { width: 1200, height: 630 };

/** Shared dark-branded OG card used by every guide's opengraph-image route. */
export function guideOgImage(title: string) {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    padding: '80px',
                    background: '#111827',
                    color: '#ffffff',
                    fontFamily: 'sans-serif',
                }}
            >
                <div style={{ fontSize: 34, color: '#60a5fa', display: 'flex' }}>JVM Expert · Guide</div>
                <div style={{ fontSize: 68, fontWeight: 700, marginTop: 24, lineHeight: 1.15, display: 'flex' }}>
                    {title}
                </div>
                <div style={{ fontSize: 30, color: '#9ca3af', marginTop: 40, display: 'flex' }}>
                    jvm.expert — container-first JVM memory sizing
                </div>
            </div>
        ),
        ogSize,
    );
}
