/**
 * cleanMarkdown.ts — Strip markdown formatting from LLM output.
 *
 * LLMs sometimes ignore "no markdown" instructions and emit **bold**,
 * ### headers, etc. This function strips them so chat bubbles show clean
 * plain text without literal asterisks.
 */

export function cleanMarkdown(text: string): string {
    if (!text) return text;

    return text
        // Remove bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        // Remove italic: *text* or _text_ (but not mid-word underscores)
        .replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '$1')
        .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
        // Remove headers: ### text → TEXT (keep content, strip hashes)
        .replace(/^#{1,6}\s+(.+)$/gm, '$1')
        // Remove horizontal rules: --- or ***
        .replace(/^[-*]{3,}\s*$/gm, '')
        // Remove inline code backticks: `text` → text
        .replace(/`([^`]+)`/g, '$1')
        // Remove code block fences: ```lang ... ```
        .replace(/```[\w]*\n?/g, '')
        // Remove bullet markers: - item → item (keep indentation natural)
        // (Do NOT remove dashes that are part of sentences)
        // Only remove leading "- " at start of line that looks like a list
        // We keep numbered lists (1. 2. 3.) since system prompt allows them
        // Clean up excessive blank lines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
