import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'Choosing a garbage collector for containers | JVM Expert';

export default function Image() {
    return guideOgImage('Choosing a garbage collector for containers');
}
