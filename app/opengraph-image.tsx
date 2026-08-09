import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'JVM Expert — container-first JVM memory sizing';

export default function Image() {
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
                <div style={{ fontSize: 96, fontWeight: 700, display: 'flex' }}>JVM Expert</div>
                <div style={{ fontSize: 38, color: '#9ca3af', marginTop: 24, display: 'flex' }}>
                    Container-first JVM memory sizing
                </div>
                <div style={{ fontSize: 30, color: '#60a5fa', marginTop: 40, display: 'flex' }}>
                    Calculator · NMT Analyzer · Flags Audit · Guides
                </div>
            </div>
        ),
        size,
    );
}
