import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ptBR } from './pt-BR';
import { es } from './es';
import { interpolate } from './index';

describe('dictionary completeness', () => {
    const enKeys = Object.keys(en).sort();

    it('pt-BR has exactly the same keys as en', () => {
        expect(Object.keys(ptBR).sort()).toEqual(enKeys);
    });

    it('es has exactly the same keys as en', () => {
        expect(Object.keys(es).sort()).toEqual(enKeys);
    });

    it('no dictionary has empty values', () => {
        for (const dict of [en, ptBR, es]) {
            for (const [key, value] of Object.entries(dict)) {
                expect(value.trim(), key).not.toBe('');
            }
        }
    });

    it('translations keep the same {placeholders} as the en source', () => {
        const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
        for (const dict of [ptBR, es]) {
            for (const key of Object.keys(en) as Array<keyof typeof en>) {
                expect(placeholders(dict[key]), key).toEqual(placeholders(en[key]));
            }
        }
    });
});

describe('interpolate', () => {
    it('replaces named placeholders', () => {
        expect(interpolate('Total {a} of {b}', { a: 1, b: 'x' })).toBe('Total 1 of x');
    });

    it('leaves unknown placeholders visible', () => {
        expect(interpolate('{missing} stays', {})).toBe('{missing} stays');
    });

    it('is a no-op without vars', () => {
        expect(interpolate('plain')).toBe('plain');
    });
});
