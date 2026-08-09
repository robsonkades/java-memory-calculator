import type { MetadataRoute } from 'next'
import { guides } from '@/lib/guides'

const BASE = 'https://jvm.expert';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const tools: MetadataRoute.Sitemap = ['/nmt', '/flags', '/fleet', '/gclog', '/threads', '/histogram', '/guides', '/glossary', '/start', '/import', '/collect', '/smaps', '/jfr', '/api-docs', '/diagnose', '/runbook'].map((path) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency: 'yearly',
    priority: 0.8,
  }));

  const guidePages: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: `${BASE}/guides/${guide.slug}`,
    lastModified,
    changeFrequency: 'yearly',
    priority: 0.6,
  }));

  return [
    {
      url: BASE,
      lastModified,
      changeFrequency: 'yearly',
      priority: 1,
    },
    ...tools,
    ...guidePages,
  ];
}
