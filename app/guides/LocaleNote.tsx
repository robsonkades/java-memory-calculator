'use client'
import { useLocale, useT } from '@/lib/i18n';

/** Guides content is English by SEO strategy; tell non-English UI users once. */
export default function LocaleNote() {
    const locale = useLocale();
    const t = useT();
    if (locale === 'en') return null;
    return (
        <p className="mb-4 text-sm text-secondary rounded-md border bg-surface px-3 py-2">
            {t('guides.englishNote')}
        </p>
    );
}
