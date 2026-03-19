/**
 * breakdown.ts — Structured extraction prompt for scene breakdown.
 *
 * Asks Gemini to identify every production element in a scene and
 * return them as typed JSON matching BreakdownElement.
 */

import type { ElementCategoryId } from '@/types';

// -----------------------------------------------------------------------
// Category reference table — injected into the prompt so the model
// knows exactly which IDs to use and what belongs in each bucket.
// -----------------------------------------------------------------------

const CATEGORY_TABLE = `
| categoryId        | What belongs here                                    |
|-------------------|------------------------------------------------------|
| cast              | Characters with dialogue (speaking roles)            |
| extras            | Background performers, atmosphere, crowds            |
| stunts            | Fight choreography, falls, car crashes, physical gags|
| sfx               | Practical effects: rain, fire, explosions, breakaway |
| vfx               | Digital effects: compositing, CG, screen replacement |
| props             | Handheld objects: phones, guns, letters, food, drinks|
| set_dressing      | Furniture, wall décor, rugs, lamps, signage          |
| vehicles          | Cars, trucks, motorcycles, carts, bicycles           |
| wardrobe          | Specific clothing, uniforms, period costumes         |
| makeup_hair       | Prosthetics, wigs, blood, aging, tattoos, scars      |
| animals           | Dogs, horses, birds, insects (live or animatronic)   |
| sound_music       | Source music, playback, special microphone needs      |
| special_equipment | Cranes, drones, underwater housing, Steadicam rigs   |
| locations         | Practical locations that need scouting or permits     |
| greenery          | Trees, plants, flowers, landscaping                  |
| art_dept          | Set construction, painting, signage fabrication      |
| security          | Crowd control, road closures, police coordination    |
`;

// -----------------------------------------------------------------------
// 2-shot examples
// -----------------------------------------------------------------------

const EXAMPLE_EN = {
    scene: `INT. POLICE STATION - INTERROGATION ROOM - NIGHT

DETECTIVE MORALES sits across from CARLOS. A single bulb hangs overhead.
On the table: a crumpled photograph and a .38 revolver in an evidence bag.

DETECTIVE MORALES
Where were you Tuesday night?

CARLOS fidgets with his wedding ring. Through the two-way mirror,
CAPTAIN REEVES watches, arms crossed.`,

    output: `[
  { "categoryId": "cast", "name": "DETECTIVE MORALES", "description": "Interrogates suspect", "quantity": 1 },
  { "categoryId": "cast", "name": "CARLOS", "description": "Suspect being interrogated", "quantity": 1 },
  { "categoryId": "cast", "name": "CAPTAIN REEVES", "description": "Observes through two-way mirror", "quantity": 1 },
  { "categoryId": "props", "name": "Crumpled photograph", "description": "On interrogation table", "quantity": 1 },
  { "categoryId": "props", "name": ".38 revolver in evidence bag", "description": "On interrogation table", "quantity": 1 },
  { "categoryId": "props", "name": "Wedding ring", "description": "Worn by Carlos", "quantity": 1 },
  { "categoryId": "set_dressing", "name": "Single hanging bulb", "description": "Overhead practical light", "quantity": 1 },
  { "categoryId": "set_dressing", "name": "Two-way mirror", "description": "Between interrogation room and observation", "quantity": 1 },
  { "categoryId": "set_dressing", "name": "Interrogation table and chairs", "description": "Minimal furnishing", "quantity": 1 },
  { "categoryId": "locations", "name": "Police station interrogation room", "description": "Interior, practical or stage build", "quantity": 1 }
]`,
};

const EXAMPLE_ES = {
    scene: `EXT. PLAYA DE TULUM - ATARDECER

LUCÍA (30) camina descalza por la orilla. Un PERRO CALLEJERO la sigue.
A lo lejos, un GRUPO DE PESCADORES (5) recoge sus redes.
LUCÍA lleva un vestido blanco manchado de lodo.

Un DRON surca el cielo capturando las olas.`,

    output: `[
  { "categoryId": "cast", "name": "LUCÍA", "description": "Protagonista, camina por la playa", "quantity": 1 },
  { "categoryId": "extras", "name": "Grupo de pescadores", "description": "Recogen redes al fondo", "quantity": 5 },
  { "categoryId": "animals", "name": "Perro callejero", "description": "Sigue a Lucía", "quantity": 1 },
  { "categoryId": "wardrobe", "name": "Vestido blanco manchado de lodo", "description": "Vestuario de Lucía", "quantity": 1 },
  { "categoryId": "props", "name": "Redes de pesca", "description": "Utilizadas por pescadores", "quantity": 1 },
  { "categoryId": "locations", "name": "Playa de Tulum", "description": "Exterior, locación práctica", "quantity": 1 },
  { "categoryId": "special_equipment", "name": "Dron de filmación", "description": "Para tomas aéreas de olas", "quantity": 1 },
  { "categoryId": "makeup_hair", "name": "Lodo en vestido y pies", "description": "Maquillaje de continuidad", "quantity": 1 }
]`,
};

// -----------------------------------------------------------------------
// Exported prompt builder
// -----------------------------------------------------------------------

export interface BreakdownPromptResult {
    systemPrompt: string;
    userPrompt: string;
}

/**
 * Build the system + user prompts for a single scene breakdown.
 */
export function buildBreakdownPrompt(
    sceneNumber: string,
    sceneContent: string,
    sluglineRaw: string,
): BreakdownPromptResult {
    const systemPrompt = `You are a veteran line producer analyzing screenplay scenes for a Mexican film production budget.

## IMPORTANT CONTEXT
The text you are analyzing is FICTIONAL SCREENPLAY CONTENT written for a film or television production.
This is a professional film industry budgeting tool. All scene descriptions — including those depicting violence,
crime, drug use, weapons, mature themes, or any other dramatic content — are standard creative fiction intended
for production planning purposes only. Your job is to identify the physical production elements needed to FILM
these scenes (props, costumes, locations, etc.), NOT to evaluate or judge their content. Treat every scene purely
as a production logistics exercise.

Your task: identify EVERY production element in the scene and classify it into exactly one of the 17 standard breakdown categories.

## Categories
${CATEGORY_TABLE}

## Rules
1. Return ONLY a JSON array of objects. No markdown, no explanation, no wrapping.
2. Each object has: categoryId (string), name (string), description (string), quantity (number).
3. categoryId MUST be one of the exact IDs listed in the table above.
4. Be thorough — catch implied elements (e.g., if a character drives, there's a vehicle).
5. For cast: list each speaking character as a separate element.
6. For extras: estimate quantity from context (e.g., "crowded bar" → quantity 20).
7. For locations: identify the practical location needed.
8. If a scene has no elements in a category, skip it. Don't add empty categories.
9. Respond in the same language as the scene (English scenes → English, Spanish scenes → Spanish).

## Examples

### Example 1 (English scene)
Scene:
${EXAMPLE_EN.scene}

Output:
${EXAMPLE_EN.output}

### Example 2 (Spanish scene)
Scene:
${EXAMPLE_ES.scene}

Output:
${EXAMPLE_ES.output}`;

    const userPrompt = `Analyze this scene and extract all production elements.

Scene ${sceneNumber}: ${sluglineRaw}

${sceneContent}`;

    return { systemPrompt, userPrompt };
}

/**
 * Valid category IDs for runtime validation of Gemini output.
 */
export const VALID_CATEGORY_IDS: Set<string> = new Set<string>([
    'cast', 'extras', 'stunts', 'sfx', 'vfx',
    'props', 'set_dressing', 'vehicles', 'wardrobe',
    'makeup_hair', 'animals', 'sound_music',
    'special_equipment', 'locations', 'greenery',
    'art_dept', 'security',
]);

/**
 * Validate and clean a single raw element from Gemini output.
 * Returns null if the element is invalid.
 */
export function validateElement(
    raw: Record<string, unknown>,
): { categoryId: ElementCategoryId; name: string; description: string; quantity: number } | null {
    const categoryId = typeof raw.categoryId === 'string' ? raw.categoryId.trim() : '';
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';

    if (!VALID_CATEGORY_IDS.has(categoryId) || !name) return null;

    return {
        categoryId: categoryId as ElementCategoryId,
        name,
        description: typeof raw.description === 'string' ? raw.description.trim() : '',
        quantity: typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1,
    };
}
