import { describe, it, expect } from 'vitest';
import {
    validateElement,
    VALID_CATEGORY_IDS,
    buildBreakdownPrompt,
} from './breakdown';

// ---------------------------------------------------------------------------
// VALID_CATEGORY_IDS
// ---------------------------------------------------------------------------

describe('VALID_CATEGORY_IDS', () => {
    it('contains all 17 standard breakdown categories', () => {
        expect(VALID_CATEGORY_IDS.size).toBe(17);
    });

    it('includes core categories', () => {
        const required = ['cast', 'extras', 'props', 'vehicles', 'wardrobe', 'locations', 'vfx', 'sfx'];
        for (const cat of required) {
            expect(VALID_CATEGORY_IDS.has(cat)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// validateElement
// ---------------------------------------------------------------------------

describe('validateElement', () => {
    it('accepts a valid cast element', () => {
        const result = validateElement({
            categoryId: 'cast',
            name: 'DETECTIVE MORALES',
            description: 'Lead detective',
            quantity: 1,
        });
        expect(result).not.toBeNull();
        expect(result!.categoryId).toBe('cast');
        expect(result!.name).toBe('DETECTIVE MORALES');
    });

    it('rejects invalid categoryId', () => {
        const result = validateElement({
            categoryId: 'invalid_cat',
            name: 'Something',
            description: '',
            quantity: 1,
        });
        expect(result).toBeNull();
    });

    it('rejects empty name', () => {
        const result = validateElement({
            categoryId: 'cast',
            name: '',
            description: 'test',
            quantity: 1,
        });
        expect(result).toBeNull();
    });

    it('rejects name with only whitespace', () => {
        const result = validateElement({
            categoryId: 'cast',
            name: '   ',
            description: 'test',
            quantity: 1,
        });
        expect(result).toBeNull();
    });

    it('defaults missing quantity to 1', () => {
        const result = validateElement({
            categoryId: 'extras',
            name: 'Crowd',
            description: 'Background',
        });
        expect(result).not.toBeNull();
        expect(result!.quantity).toBe(1);
    });

    it('defaults negative quantity to 1', () => {
        const result = validateElement({
            categoryId: 'props',
            name: 'Gun',
            description: 'Prop weapon',
            quantity: -5,
        });
        expect(result).not.toBeNull();
        expect(result!.quantity).toBe(1);
    });

    it('trims whitespace from name and description', () => {
        const result = validateElement({
            categoryId: 'vehicles',
            name: '  Police Car  ',
            description: '  Patrol vehicle  ',
            quantity: 2,
        });
        expect(result!.name).toBe('Police Car');
        expect(result!.description).toBe('Patrol vehicle');
    });
});

// ---------------------------------------------------------------------------
// buildBreakdownPrompt
// ---------------------------------------------------------------------------

describe('buildBreakdownPrompt', () => {
    it('includes category table in system prompt', () => {
        const { systemPrompt } = buildBreakdownPrompt('1', 'INT. OFFICE - DAY', 'INT. OFFICE - DAY');
        expect(systemPrompt).toContain('categoryId');
        expect(systemPrompt).toContain('cast');
        expect(systemPrompt).toContain('props');
    });

    it('includes scene number in user prompt', () => {
        const { userPrompt } = buildBreakdownPrompt('42', 'some content', 'INT. BAR - NIGHT');
        expect(userPrompt).toContain('Scene 42');
    });

    it('includes fiction disclaimer in system prompt', () => {
        const { systemPrompt } = buildBreakdownPrompt('1', 'content', 'slug');
        expect(systemPrompt).toContain('FICTIONAL SCREENPLAY CONTENT');
    });
});
