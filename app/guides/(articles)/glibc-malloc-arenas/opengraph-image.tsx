import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'glibc malloc arenas: the RSS nobody accounts for | JVM Expert';

export default function Image() {
    return guideOgImage('glibc malloc arenas: the RSS nobody accounts for');
}
