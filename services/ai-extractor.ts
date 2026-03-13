/**
 * AI Extractor Service
 *
 * Sends an uploaded file (PDF or other) to OpenAI GPT-4o to extract
 * structured healthcare provider information:
 *   - Clinic / practice name
 *   - Provider / doctor name(s)
 *   - Specialty
 *   - Phone number
 *   - Address
 *
 * This is used as the primary extraction step in non-ehr-processor.ts
 * when text-based regex parsing cannot extract enough data (e.g. for PDFs).
 *
 * Uses the existing EXPO_PUBLIC_OPEN_AI_PUBLIC_KEY from .env.
 * Falls back gracefully (returns null) if the key is missing or the API errors.
 */

import { File } from 'expo-file-system';
import { ProcessedFileResult } from './non-ehr-processor';

declare const process: { env: Record<string, string | undefined> };

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPEN_AI_PUBLIC_KEY ?? '';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

/** Maximum base64 size we'll send (~10 MB decoded → ~13.3 MB base64) */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// ─────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a medical document and image parser. 
Extract healthcare provider information, visit notes, and diagnostic insights from the provided document or image (which could be a PDF, a medical record scan, or even a diagnostic image like an X-ray or ultrasound).

Return ONLY a valid JSON object with no extra text.

The JSON must follow this exact shape:
{
  "clinicName": "string — name of the clinic, hospital, or practice. Use null if not found.",
  "providerNames": ["array of doctor/provider names found. Use [] if none found."],
  "specialty": "string or null — medical specialty (e.g., Cardiology, Orthopedics).",
  "phone": "string or null",
  "address": "string or null",
  "notes": [
    {
      "date": "string — date of the visit or image acquisition",
      "content": "string — summary of findings, treatment, or observations. For images like X-rays, describe the key findings mentioned in the report or visible in the image."
    }
  ]
}

Rules:
- Cover all historical notes and years (e.g., 2020-2025).
- For images (X-rays, scans), extract any visible text or findings reports.
- Return null for fields you cannot find.
- IMPORTANT: providerNames should ONLY contain actual doctor/provider names found in the content. NEVER use the filename, image name, or file path as a provider name. If no provider name is visible, return an empty array [].
- IMPORTANT: clinicName should ONLY be a real clinic/practice name found in the content. NEVER use the filename as a clinic name.
- Respond with raw JSON only.`;

const USER_PROMPT = (fileName: string) =>
    `Please extract all provider information, visit notes, and medical findings from this file. The filename is "${fileName}" but do NOT use this filename as a provider name or clinic name — only use names actually found in the document content. If it's an image (like an X-ray), describe the findings.`;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AiExtractionResult {
    clinicName: string | null;
    providerNames: string[];
    specialty: string | null;
    phone: string | null;
    address: string | null;
    notes: Array<{ date: string; content: string }>;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Maximum timeout for AI requests (2 minutes) to allow for large PDF processing */
const NETWORK_TIMEOUT_MS = 120 * 1024;

/** OpenAI message content block types */
interface OpenAITextBlock {
    type: 'text';
    text: string;
}
interface OpenAIImageUrlBlock {
    type: 'image_url';
    image_url: { url: string };
}
interface OpenAIFileBlock {
    type: 'file';
    file: { filename: string; file_data: string };
}
type OpenAIContentBlock = OpenAITextBlock | OpenAIImageUrlBlock | OpenAIFileBlock;

interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | OpenAIContentBlock[];
}

/** Shape of the fetch options passed to fetchWithRetry */
interface FetchOptions {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
}

/** Helper to perform fetch with a timeout and a single retry for 429s */
async function fetchWithRetry(url: string, options: FetchOptions, timeoutMs = NETWORK_TIMEOUT_MS): Promise<Response> {
    const execute = async () => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    };

    let response = await execute();

    // If rate limited, wait 1s and try one more time
    if (response.status === 429) {
        console.warn('[AiExtractor] Rate limit reached (429), retrying in 1s...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = await execute();
    }

    return response;
}

/** 
 * Helper to normalize various date formats (MM/DD/YYYY, etc) to ISO string.
 * Falls back to now if parsing fails.
 */
function parseToIsoDate(dateStr: string): string {
    if (!dateStr) return new Date().toISOString();

    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) {
        return new Date(parsed).toISOString();
    }

    // Handle MM/DD/YYYY specifically if standard parser fails
    const parts = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (parts) {
        const [_, month, day, year] = parts;
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(d.getTime())) return d.toISOString();
    }

    return new Date().toISOString();
}

/** Convert a local file URI to a base64 string using expo-file-system v2 File API. */
async function readFileAsBase64(uri: string): Promise<string | null> {
    try {
        const fileRef = new File(uri);

        // Check existence
        if (!fileRef.exists) {
            console.warn('[AiExtractor] File does not exist at URI:', uri);
            return null;
        }

        // Guard against enormous files
        const size = fileRef.size;
        if (size !== undefined && size > MAX_FILE_SIZE_BYTES) {
            console.warn(`[AiExtractor] File too large to send (${size} bytes), skipping AI extraction.`);
            return null;
        }

        // Read full contents as ArrayBuffer, then encode to base64
        const buffer = await fileRef.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    } catch (err) {
        console.error('[AiExtractor] Error reading file as base64:', err);
        return null;
    }
}

/** Determine the OpenAI media type for a given MIME type. */
function openAiMediaType(mimeType: string): string {
    const mt = mimeType.toLowerCase();
    if (mt === 'application/pdf') return 'application/pdf';
    if (mt.startsWith('image/')) {
        // Most vision models handle jpeg, png, webp
        if (mt === 'image/jpeg' || mt === 'image/jpg') return 'image/jpeg';
        if (mt === 'image/png') return 'image/png';
        if (mt === 'image/webp') return 'image/webp';
        return 'image/jpeg'; // Default to jpeg for other image types
    }
    // Docx/Xlsx might not be directly supported in 'file' block for all endpoints yet, 
    // but we'll try sending them as their native types if they are being sent via 'file'
    if (mt.includes('word')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (mt.includes('excel') || mt.includes('sheet')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'text/plain';
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Extract provider information from a file using OpenAI GPT-4o.
 */
export async function extractProviderInfoWithAI(
    uri: string,
    mimeType: string,
    fileName: string
): Promise<ProcessedFileResult | null> {
    if (!OPENAI_API_KEY) {
        console.warn('[AiExtractor] No OpenAI API key configured. Skipping.');
        return null;
    }

    try {
        const base64 = await readFileAsBase64(uri);
        if (!base64) return null;

        const mediaType = openAiMediaType(mimeType);
        const isImage = mimeType.startsWith('image/');

        // Build the message payload.
        // We use the 'file' block which works for PDF/Images in some GPT-4o configs,
        // but for images, image_url is the most standard for Vision.
        const contentBlock: OpenAIContentBlock[] = [
            { type: 'text', text: USER_PROMPT(fileName) }
        ];

        if (isImage) {
            contentBlock.push({
                type: 'image_url',
                image_url: { url: `data:${mediaType};base64,${base64}` }
            });
        } else {
            contentBlock.push({
                type: 'file',
                file: {
                    filename: fileName,
                    file_data: `data:${mediaType};base64,${base64}`,
                },
            });
        }

        const messages: OpenAIMessage[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: contentBlock },
        ];

        console.log(`[AiExtractor] 🤖 Sending "${fileName}" to GPT-4o for extraction...`);

        const response = await fetchWithRetry(OPENAI_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages,
                max_tokens: 4096,
                temperature: 0,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AiExtractor] OpenAI API error ${response.status}:`, errorText);
            return null;
        }

        const data = await response.json();
        const rawContent: string = data?.choices?.[0]?.message?.content ?? '';

        if (!rawContent) {
            console.warn('[AiExtractor] Empty response from OpenAI.');
            return null;
        }

        // Parse the JSON the model returned
        let parsed: AiExtractionResult;
        try {
            parsed = JSON.parse(rawContent);
        } catch (parseErr) {
            // Model may have wrapped JSON in markdown — try stripping ```json fences
            const fencedMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (fencedMatch?.[1]) {
                parsed = JSON.parse(fencedMatch[1].trim());
            } else {
                console.error('[AiExtractor] Could not parse JSON from model response:', rawContent);
                return null;
            }
        }

        const clinicName = parsed.clinicName?.trim() || 'Unknown Clinic';
        const providerNames = (parsed.providerNames ?? [])
            .map((n: string) => n.trim())
            .filter(Boolean);

        // Do NOT fall back to filename as provider name.
        // An empty array is intentional — the batch processor will inherit
        // provider names from other files in the same upload (e.g. a PDF
        // that accompanies these images).

        const result: ProcessedFileResult = {
            clinicName,
            providerNames,
            specialty: parsed.specialty?.trim() || undefined,
            phone: parsed.phone?.trim() || undefined,
            address: parsed.address?.trim() || undefined,
            notes: (parsed.notes ?? []).map(n => {
                const isoDate = parseToIsoDate(n.date);
                return {
                    date: n.date,
                    content: n.content,
                    createdAt: isoDate
                };
            }),
        };

        console.log(`[AiExtractor] ✅ Extracted: clinic="${clinicName}", providers=[${providerNames.join(', ')}]`);
        return result;
    } catch (err) {
        console.error('[AiExtractor] Unexpected error during AI extraction:', err);
        return null;
    }
}

// ─────────────────────────────────────────────
// Treatment Summary Generator
// ─────────────────────────────────────────────

const TREATMENT_SUMMARY_SYSTEM_PROMPT = `You are a healthcare assistant that summarizes treatment documents.
Given one or more medical documents related to a patient's care with a specific provider, produce a concise, human-readable paragraph (2–5 sentences) summarizing:
- What treatments, therapies, or services the provider offers or has delivered
- Key conditions being addressed (if apparent)
- Any notable medications, procedures, or recommendations found

Rules:
- Be concise and clear; use plain language a patient can understand.
- Do NOT hallucinate information not present in the documents.
- If the documents contain no treatment-related information, respond with exactly: "No treatment information could be extracted from the uploaded files."
- Do NOT use markdown formatting — return plain text only.`;

export interface TreatmentSummaryFile {
    uri: string;
    mimeType: string;
    fileName: string;
}

/**
 * Generate an AI-powered treatment summary from uploaded files.
 *
 * @param files      Array of files (uri, mimeType, fileName) to analyse
 * @param providerName  Name of the provider (for context)
 * @param clinicName    Name of the clinic (for context)
 * @returns             A plain-text summary string, or null on failure
 */
export async function summarizeTreatmentFromFiles(
    files: TreatmentSummaryFile[],
    providerName: string,
    clinicName: string,
): Promise<string | null> {
    if (!OPENAI_API_KEY) {
        console.warn('[AiExtractor] No OpenAI API key configured. Skipping treatment summary.');
        return null;
    }

    if (files.length === 0) {
        return null;
    }

    try {
        // Build content blocks — include up to 5 files to avoid token overload
        const contentBlocks: OpenAIContentBlock[] = [
            {
                type: 'text',
                text: `Summarize the treatment information from the following ${files.length} document(s) related to provider "${providerName}" at "${clinicName}".`,
            },
        ];

        const filesToProcess = files.slice(0, 5); // Cap at 5 files
        for (const file of filesToProcess) {
            const base64 = await readFileAsBase64(file.uri);
            if (!base64) continue;

            const mediaType = openAiMediaType(file.mimeType);
            const isImage = file.mimeType.startsWith('image/');

            if (isImage) {
                contentBlocks.push({
                    type: 'image_url',
                    image_url: { url: `data:${mediaType};base64,${base64}` }
                });
            } else {
                contentBlocks.push({
                    type: 'file',
                    file: {
                        filename: file.fileName,
                        file_data: `data:${mediaType};base64,${base64}`,
                    },
                });
            }
        }

        // If no files were readable, bail
        if (contentBlocks.length <= 1) {
            return null;
        }

        const messages: OpenAIMessage[] = [
            { role: 'system', content: TREATMENT_SUMMARY_SYSTEM_PROMPT },
            { role: 'user', content: contentBlocks },
        ];

        console.log(`[AiExtractor] 🤖 Generating treatment summary for "${providerName}" (${contentBlocks.length - 1} file(s))...`);

        const response = await fetchWithRetry(OPENAI_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages,
                max_tokens: 512,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AiExtractor] Treatment summary API error ${response.status}:`, errorText);
            return null;
        }

        const data = await response.json();
        const summary = data?.choices?.[0]?.message?.content?.trim() ?? '';

        if (!summary) {
            console.warn('[AiExtractor] Empty treatment summary response from OpenAI.');
            return null;
        }

        console.log(`[AiExtractor] ✅ Treatment summary generated for "${providerName}".`);
        return summary;
    } catch (err) {
        console.error('[AiExtractor] Unexpected error during treatment summary:', err);
        return null;
    }
}
