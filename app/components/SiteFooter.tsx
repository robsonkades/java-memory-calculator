'use client'
import { useT } from '@/lib/i18n';

export default function SiteFooter() {
    const t = useT();
    return (
        <footer className="border-t py-6 text-center text-sm text-muted">
            {t('footer.tagline')}
        </footer>
    );
}
