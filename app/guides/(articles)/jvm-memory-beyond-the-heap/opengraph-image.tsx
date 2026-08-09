import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'Why your JVM uses more memory than -Xmx | JVM Expert';

export default function Image() {
    return guideOgImage('Why your JVM uses more memory than -Xmx');
}
