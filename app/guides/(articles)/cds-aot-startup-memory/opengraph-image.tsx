import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'CDS, AOT cache and startup memory | JVM Expert';

export default function Image() {
    return guideOgImage('CDS, AOT cache and startup memory');
}
