import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'Metaspace, demystified | JVM Expert';

export default function Image() {
    return guideOgImage('Metaspace, demystified');
}
