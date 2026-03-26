import { describe, it, expect } from 'vitest';
import { parseScreenplay } from './screenplay-parser';

// ---------------------------------------------------------------------------
// Helper — parse a single scene heading and return the slugline
// ---------------------------------------------------------------------------

function parseSingle(line: string) {
    // Wrap the heading in minimal screenplay text so the parser finds it
    const result = parseScreenplay(line + '\n\nSome action line.\n', 1);
    expect(result.scenes.length).toBe(1);
    return result.scenes[0]!.slugline;
}

// ---------------------------------------------------------------------------
// Scene number stripping from raw heading
// ---------------------------------------------------------------------------

describe('scene heading: trailing scene number stripping', () => {
    it('strips spaced trailing number ("AMANECER  3")', () => {
        const slug = parseSingle('3  INT. SUPERMERCADO – CARNICERÍA – AMANECER  3');
        expect(slug.raw).toBe('INT. SUPERMERCADO – CARNICERÍA – AMANECER');
        expect(slug.timeOfDay).toBe('AMANECER');
    });

    it('strips glued trailing number ("AMANECER3")', () => {
        const slug = parseSingle('3 INT. SUPERMERCADO - CARNICERÍA - AMANECER3');
        expect(slug.raw).toBe('INT. SUPERMERCADO - CARNICERÍA - AMANECER');
        expect(slug.timeOfDay).toBe('AMANECER');
    });

    it('strips glued + spaced trailing number ("AMANECER3 3")', () => {
        const slug = parseSingle('3  INT. SUPERMERCADO – CARNICERÍA – AMANECER3 3');
        expect(slug.raw).toBe('INT. SUPERMERCADO – CARNICERÍA – AMANECER');
        expect(slug.timeOfDay).toBe('AMANECER');
    });

    it('strips trailing number with letter suffix ("NOCHE 123H")', () => {
        const slug = parseSingle('123H  INT. SALÓN - NOCHE 123H');
        expect(slug.raw).toBe('INT. SALÓN - NOCHE');
        expect(slug.timeOfDay).toBe('NOCHE');
    });

    it('strips accented time-of-day with glued number ("DÍA4 4")', () => {
        const slug = parseSingle('4  EXT. PARQUE - DÍA4 4');
        expect(slug.raw).toBe('EXT. PARQUE - DÍA');
        expect(slug.timeOfDay).toBe('DÍA');
    });

    it('does NOT strip digits that are part of the location', () => {
        // "CALLE 42" is a location name — digits should remain
        const slug = parseSingle('5  EXT. CALLE 42 - DAY  5');
        expect(slug.raw).toBe('EXT. CALLE 42 - DAY');
        expect(slug.location).toBe('CALLE 42');
    });

    it('handles clean heading without any trailing numbers', () => {
        const slug = parseSingle('INT. OFICINA - DÍA');
        expect(slug.raw).toBe('INT. OFICINA - DÍA');
        expect(slug.timeOfDay).toBe('DÍA');
    });

    it('handles leading scene number only (no trailing)', () => {
        const slug = parseSingle('7  EXT. PLAYA - ATARDECER');
        expect(slug.raw).toBe('EXT. PLAYA - ATARDECER');
        expect(slug.timeOfDay).toBe('ATARDECER');
    });
});

// ---------------------------------------------------------------------------
// Time-of-day detection (Spanish keywords)
// ---------------------------------------------------------------------------

describe('scene heading: Spanish time-of-day keywords', () => {
    it('detects AMANECER (Dawn)', () => {
        const slug = parseSingle('INT. CASA - AMANECER');
        expect(slug.timeOfDay).toBe('AMANECER');
    });

    it('detects MADRUGADA', () => {
        const slug = parseSingle('EXT. CALLE - MADRUGADA');
        expect(slug.timeOfDay).toBe('MADRUGADA');
    });

    it('detects NOCHE', () => {
        const slug = parseSingle('INT. BAR - NOCHE');
        expect(slug.timeOfDay).toBe('NOCHE');
    });

    it('detects DÍA (with accent)', () => {
        const slug = parseSingle('EXT. MERCADO - DÍA');
        expect(slug.timeOfDay).toBe('DÍA');
    });

    it('detects DIA (without accent)', () => {
        const slug = parseSingle('EXT. MERCADO - DIA');
        expect(slug.timeOfDay).toBe('DÍA');
    });
});
