import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'MaxRAMPercentage done right | JVM Expert';

export default function Image() {
    return guideOgImage('MaxRAMPercentage done right');
}
