import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0a0a0a',
                    color: '#ededed',
                    fontSize: 176,
                    fontWeight: 700,
                    letterSpacing: -8,
                    borderRadius: 96,
                }}
            >
                JVM
            </div>
        ),
        size,
    );
}
