import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'Reading Native Memory Tracking output | JVM Expert';

export default function Image() {
    return guideOgImage('Reading Native Memory Tracking output');
}
