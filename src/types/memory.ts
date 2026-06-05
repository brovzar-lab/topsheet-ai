/**
 * memory.ts — Type definitions for the Project Brain memory system.
 *
 * Two scopes:
 *   - 'global': Universal production knowledge (rates, rules, patterns).
 *               Stored at users/{uid}/global_memories/{id}.
 *               Transfers across all projects. Survives project deletion.
 *
 *   - 'project': Script-specific facts (characters, scenes, plot).
 *                Stored at users/{uid}/projects/{pid}/memories/{id}.
 *                Only visible within the owning project. Deleted with it.
 */

// ── Enums / Union Types ─────────────────────────────────────────────────

/** Determines Firestore path and retrieval isolation. */
export type MemoryScope = 'global' | 'project';

/**
 * Hindsight-inspired memory classification:
 *   fact        — Objective, verifiable ("Carnicero is the antagonist")
 *   experience  — Numeric / rate data ("Stunt coordinator: $2K/week CDMX")
 *   preference  — User's stated preference ("Always flag violence for stunts")
 *   observation — Auto-synthesized pattern ("Horror scripts miss SFX on first pass")
 */
export type MemoryType = 'fact' | 'experience' | 'preference' | 'observation';

/** Where the memory was captured from. */
export type MemorySource =
    | 'rafa'
    | 'sandra'
    | 'breakdown'
    | 'user_edit'
    | 'budget_upload'
    | 'manual';

// ── Core Memory ─────────────────────────────────────────────────────────

export interface Memory {
    id: string;
    scope: MemoryScope;
    projectId?: string;           // set only for project-scoped memories

    // Content
    type: MemoryType;
    content: string;              // human-readable lesson
    source: MemorySource;
    rawContext?: string;          // original message / action that spawned this

    // Classification (for recall)
    entities: string[];           // named things: characters, locations, crew roles
    categories: string[];         // element categories: 'props', 'stunts', 'cast', etc.
    keywords: string[];           // free-text tokens for matching
    genre?: string;               // 'horror' | 'thriller' | 'drama' etc.
    territory?: string;           // 'CDMX' | 'Jalisco' | 'Colombia' etc.

    // Confidence (Hindsight-style)
    confidence: number;           // 0.0–1.0, new memories start at 0.7
    timesRecalled: number;        // how many AI calls injected this memory
    timesConfirmed: number;       // user agreed / element survived review
    timesContradicted: number;    // user dismissed / element was deleted
    lastRecalledAt?: string;      // ISO timestamp — for temporal decay

    // Provenance
    sceneNumbers?: string[];      // which scenes were involved (project-scoped)
    createdAt: string;            // ISO timestamp
    updatedAt: string;            // ISO timestamp
    archived: boolean;            // soft-delete for decayed memories
}

// ── Query / Retrieval ───────────────────────────────────────────────────

/** Context passed to recall() for scoring. */
export interface QueryContext {
    /** Current scene content (for keyword extraction). */
    sceneContent?: string;
    /** Element categories active in the query context. */
    categories?: string[];
    /** Named entities in the current context. */
    entities?: string[];
    /** Free-text keywords extracted from the context. */
    keywords?: string[];
    /** Genre of the current project. */
    genre?: string;
    /** Production territory. */
    territory?: string;
}

/** Result from recall() — a memory with its relevance score. */
export interface ScoredMemory {
    memory: Memory;
    score: number;
}

// ── Retain Events ───────────────────────────────────────────────────────

/** Payload for the retain() function. */
export interface RetainEvent {
    source: MemorySource;
    projectId: string;
    /** Raw content to extract memories from (chat message, element JSON, etc.) */
    content: string;
    /** Optional context for better classification. */
    sceneNumber?: string;
    categories?: string[];
    genre?: string;
    territory?: string;
}

// ── Extracted Memory (from LLM) ─────────────────────────────────────────

/** Shape returned by the extraction LLM before we add IDs and timestamps. */
export interface ExtractedMemory {
    scope: MemoryScope;
    type: MemoryType;
    content: string;
    entities: string[];
    categories: string[];
    keywords: string[];
    genre?: string;
    territory?: string;
    sceneNumbers?: string[];
}

// ── Constants ───────────────────────────────────────────────────────────

/** Default confidence for newly created memories. */
export const DEFAULT_CONFIDENCE = 0.7;

/** Memories below this confidence are auto-archived during reflect(). */
export const ARCHIVE_THRESHOLD = 0.2;

/** Maximum memories injected into a single system prompt. */
export const MAX_RECALL_MEMORIES = 15;

/** Confidence decay rate per day unused. */
export const DECAY_RATE_PER_DAY = 0.005;
