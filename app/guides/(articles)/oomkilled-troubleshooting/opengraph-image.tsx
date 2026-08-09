import { guideOgImage, ogSize } from '@/lib/og';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'OOMKilled troubleshooting checklist | JVM Expert';

export default function Image() {
    return guideOgImage('OOMKilled troubleshooting checklist');
}
