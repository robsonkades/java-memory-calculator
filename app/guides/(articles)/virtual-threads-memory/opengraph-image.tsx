import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'What virtual threads change about memory | JVM Expert';

export default function Image() {
    return guideOgImage('What virtual threads change about memory');
}
