import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'JVM Expert',
        short_name: 'JVM Expert',
        description: 'Container-first JVM memory sizing — calculator, analyzers and guides.',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0a0a0a',
        icons: [
            { src: '/icon', sizes: '512x512', type: 'image/png' },
            { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
        ],
    };
}
