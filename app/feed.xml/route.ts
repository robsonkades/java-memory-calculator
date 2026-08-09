import { guides } from '@/lib/guides';

export const dynamic = 'force-static';

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

export async function GET() {
    const items = guides
        .map((guide) => [
            '    <item>',
            `      <title>${escapeXml(guide.title)}</title>`,
            `      <link>https://jvm.expert/guides/${guide.slug}</link>`,
            `      <guid isPermaLink="true">https://jvm.expert/guides/${guide.slug}</guid>`,
            `      <description>${escapeXml(guide.description)}</description>`,
            '    </item>',
        ].join('\n'))
        .join('\n');

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0">',
        '  <channel>',
        '    <title>JVM Expert Guides</title>',
        '    <link>https://jvm.expert/guides</link>',
        '    <description>Practical guides on JVM memory sizing, garbage collector choice and native memory diagnostics for containerized Java applications.</description>',
        `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
        items,
        '  </channel>',
        '</rss>',
    ].join('\n');

    return new Response(xml, {
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
}
