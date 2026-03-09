/**
 * Non-EHR Data Processor Service
 *
 * Handles all processing of non-EHR (non-Electronic Health Record) data:
 * - File uploads
 * - Clinic name extraction  → surfaced on the Connected EHRs screen as "Integrative"
 * - Provider/doctor name extraction → surfaced on the Integrative home screen
 * - Data deduplication and storage
 *
 * One uploaded file can yield ONE clinic and ONE OR MORE individual providers.
 *
 * Designed to be API-agnostic so it can be migrated to a backend API in the future.
 * The public interface (types + functions) should remain stable even if the implementation changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { extractProviderInfoWithAI } from './ai-extractor';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/**
 * A clinic/organisation extracted from uploaded files.
 * Surfaced on the Connected EHRs screen with type = 'Integrative'.
 */
export interface NonEhrClinic {
    id: string;
    /** Clinic / hospital / practice name */
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    /** When first seen */
    createdAt: string;
    updatedAt: string;
}

export interface NonEhrFile {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    uri: string;
    uploadedAt: string;
    /** Hash used for deduplication */
    contentHash: string;
    /** ID of the provider this file belongs to */
    providerId: string;
    /** ID of the clinic this file belongs to */
    clinicId: string;
}

export interface NonEhrAppointment {
    id: string;
    date: string;
    time?: string;
    type: string;
    status: 'Previous' | 'Upcoming' | 'Cancelled';
    notes?: string;
}

export interface NonEhrNote {
    id: string;
    date: string;
    content: string;
    createdAt: string;
}

/**
 * An individual provider/doctor extracted from uploaded files.
 * Shown on the Integrative home screen.
 */
export interface NonEhrProvider {
    id: string;
    /** Provider (doctor/practitioner) name */
    providerName: string;
    /** ID of the parent clinic */
    clinicId: string;
    /** Clinic name (denormalised for convenience) */
    clinicName: string;
    specialty?: string;
    phone?: string;
    email?: string;
    address?: string;
    createdAt: string;
    updatedAt: string;
    fileIds: string[];
    /** Focus / area of support (free text set by user) */
    focusOfSupport?: string;
    appointments: NonEhrAppointment[];
    notes: NonEhrNote[];
}

/**
 * What was extracted from a single uploaded file.
 * A file can list multiple doctors working at the same clinic.
 */
export interface ProcessedFileResult {
    /** Clinic / organisation name */
    clinicName: string;
    /** One or more provider names found in the file */
    providerNames: string[];
    specialty?: string;
    phone?: string;
    email?: string;
    address?: string;
    appointments?: Omit<NonEhrAppointment, 'id'>[];
    notes?: Omit<NonEhrNote, 'id'>[];
    rawText?: string;
}

export interface UploadResult {
    added: boolean;
    /** Providers created or updated by this file */
    providers: NonEhrProvider[];
    /** Clinic created or updated */
    clinic?: NonEhrClinic;
    message: string;
    isDuplicate: boolean;
}

// ─────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────

const STORAGE_KEY_PROVIDERS = '@non_ehr_providers';
const STORAGE_KEY_FILES = '@non_ehr_files';
const STORAGE_KEY_CLINICS = '@non_ehr_clinics';

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

async function saveProviders(providers: NonEhrProvider[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(providers));
}

async function saveFiles(files: NonEhrFile[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(files));
}

async function saveClinics(clinics: NonEhrClinic[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY_CLINICS, JSON.stringify(clinics));
}

function computeContentHash(fileName: string, size: number, uri: string | undefined): string {
    // Safety guard for undefined URI
    const uriSuffix = uri ? uri.split('/').pop() || '' : '';
    return `${fileName || 'unknown'}__${size || 0}__${uriSuffix}`;
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalizes a provider name by removing common titles and suffixes (MD, Dr., etc)
 * to allow for better matching across files.
 */
function normalizeName(name: string): string {
    return name
        .replace(/\b(Dr\.?|MD|D\.O\.|DO|N\.P\.|NP|P\.A\.|PA|R\.N\.|RN|PT|OT)\b/gi, '')
        .replace(/[.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Checks if two provider names are likely the same person.
 */
function namesMatch(nameA: string, nameB: string): boolean {
    if (!nameA || !nameB) return false;
    const normA = normalizeName(nameA);
    const normB = normalizeName(nameB);
    if (!normA || !normB) return false;

    // Direct match of normalized names
    if (normA === normB) return true;

    const wordsA = normA.split(' ').filter(w => w.length > 1);
    const wordsB = normB.split(' ').filter(w => w.length > 1);

    if (wordsA.length < 2 || wordsB.length < 2) return normA === normB;

    // Order-agnostic word matching (e.g. "John Smith" matches "Smith John")
    if (wordsA.length === wordsB.length) {
        const setA = new Set(wordsA);
        if (wordsB.every(w => setA.has(w))) return true;
    }

    // Subset matching (e.g. "Dr. John Michael Smith" matches "John Smith")
    if (wordsA.every(w => wordsB.includes(w)) || wordsB.every(w => wordsA.includes(w))) {
        return true;
    }

    return false;
}

// ─────────────────────────────────────────────
// File text extraction
// ─────────────────────────────────────────────

async function extractTextFromFile(uri: string, mimeType: string): Promise<string> {
    try {
        if (mimeType.startsWith('image/')) {
            return '';
        }

        if (
            mimeType === 'text/plain' ||
            mimeType === 'application/json' ||
            mimeType.startsWith('text/')
        ) {
            const response = await fetch(uri);
            return await response.text();
        }

        if (mimeType === 'application/pdf') {
            return '';
        }

        // Fallback: try fetching as text
        const response = await fetch(uri);
        return await response.text();
    } catch (error) {
        console.error('[NonEhrProcessor] Error extracting text from file:', error);
        return '';
    }
}

// ─────────────────────────────────────────────
// Provider / clinic name extraction
// ─────────────────────────────────────────────

/**
 * Parse clinic name and one or more provider names from free-form text.
 *
 * Rules:
 *  - Clinic name  → appears in Connected EHRs as "Integrative"
 *  - Provider name(s) → individual rows on the Integrative home screen
 *
 * The heuristics here are intentionally simple so they work without any
 * network call. In the future this function can delegate to an LLM / API.
 */
function parseProviderInfoFromText(text: string | null | undefined, fileName: string): ProcessedFileResult {
    const safeText = text || '';
    const lines = safeText
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    const providerNames: string[] = [];
    let clinicName = '';
    let specialty = '';
    let phone = '';
    let email = '';
    let address = '';
    const appointments: Omit<NonEhrAppointment, 'id'>[] = [];

    // ── Provider / Doctor names (collect ALL matches) ──────────────────────
    const providerLinePatterns = [
        /(?:provider|physician|doctor|dr\.?|practitioner)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z.]+){1,3})/i,
        /(?:attending|prescribing|referring|signed by|authored by)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z.]+){1,3})/i,
    ];
    // Inline "Dr." pattern – a line might just say "Dr. Jane Smith"
    const inlineDrPattern = /\bDr\.?\s+([A-Z][a-z]+(?: [A-Z][a-z.]+){1,3})/g;

    const seenNames = new Set<string>();

    for (const line of lines) {
        for (const pattern of providerLinePatterns) {
            const m = line.match(pattern);
            if (m?.[1]) {
                const name = m[1].trim();
                const key = name.toLowerCase();
                if (!seenNames.has(key)) {
                    seenNames.add(key);
                    providerNames.push(name);
                }
            }
        }
    }

    // Also scan the whole text for inline Dr. references
    let drMatch: RegExpExecArray | null;
    while ((drMatch = inlineDrPattern.exec(safeText)) !== null) {
        const name = `Dr. ${drMatch[1].trim()}`;
        const key = name.toLowerCase();
        if (!seenNames.has(key)) {
            seenNames.add(key);
            providerNames.push(name);
        }
    }

    // ── Clinic / Organisation name ─────────────────────────────────────────
    const clinicPatterns = [
        /(?:clinic|hospital|center|centre|medical group|health system|practice|associates)[:\s]*([A-Z][^,\n]{2,60})/i,
        /(?:from|organisation|organization|facility)[:\s]+([A-Z][^,\n]{2,60})/i,
    ];
    for (const line of lines) {
        for (const pattern of clinicPatterns) {
            const m = line.match(pattern);
            if (m?.[1]) {
                clinicName = m[1].trim();
                break;
            }
        }
        if (clinicName) break;
    }

    // ── Specialty ─────────────────────────────────────────────────────────
    const specialtyPattern = /(?:specialty|speciality|department|division)[:\s]+([A-Za-z &/]+)/i;
    for (const line of lines) {
        const m = line.match(specialtyPattern);
        if (m?.[1]) {
            specialty = m[1].trim();
            break;
        }
    }

    // ── Phone ─────────────────────────────────────────────────────────────
    const phonePattern = /(?:phone|tel|telephone|mobile|fax)[:\s]*([\+\d\s\-().]{7,20})/i;
    for (const line of lines) {
        const m = line.match(phonePattern);
        if (m?.[1]) {
            phone = m[1].trim();
            break;
        }
    }
    if (!phone) {
        const barePhone = safeText.match(/\b(\+?1?\s*[-.]?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4})\b/);
        if (barePhone?.[1]) phone = barePhone[1].trim();
    }

    // ── Email ─────────────────────────────────────────────────────────────
    const emailMatch = safeText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) email = emailMatch[0];

    // ── Address ───────────────────────────────────────────────────────────
    const addressPattern =
        /\d{1,5}\s+[A-Za-z0-9 .,-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)[,\s]+[A-Za-z ]+,\s*[A-Z]{2}\s*\d{5}/i;
    const addressMatch = safeText.match(addressPattern);
    if (addressMatch) address = addressMatch[0].trim();

    // ── Appointments ──────────────────────────────────────────────────────
    const datePattern =
        /(?:appointment|visit|scheduled|date)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2},? \d{4})/gi;
    let dateMatch: RegExpExecArray | null;
    while ((dateMatch = datePattern.exec(safeText)) !== null) {
        appointments.push({
            date: dateMatch[1],
            type: 'Appointment',
            status: 'Previous',
        });
    }

    // ── Fallbacks ─────────────────────────────────────────────────────────
    // NOTE: Do NOT fall back to the filename as a provider name.
    // An empty providerNames array tells Phase 2 to inherit the batch-level
    // clinic/provider context (so 10 images from the same visit all go to
    // the same provider, not 10 different "filename.jpg" providers).
    if (!clinicName) {
        clinicName = 'Unknown Clinic';
    }

    return {
        clinicName,
        providerNames,
        specialty: specialty || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        appointments: appointments.length > 0 ? appointments : undefined,
        rawText: safeText.length > 2000 ? safeText.slice(0, 2000) + '…' : safeText,
    };
}

// ─────────────────────────────────────────────
// Public API – Reads
// ─────────────────────────────────────────────

/** Return all non-EHR providers (shown on the Integrative home screen). */
export async function getNonEhrProviders(): Promise<NonEhrProvider[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_PROVIDERS);
        if (!raw) return [];
        return JSON.parse(raw) as NonEhrProvider[];
    } catch {
        return [];
    }
}

/**
 * Return all non-EHR clinics.
 * These are surfaced on the Connected EHRs screen as type "Integrative".
 */
export async function getNonEhrClinics(): Promise<NonEhrClinic[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_CLINICS);
        if (!raw) return [];
        return JSON.parse(raw) as NonEhrClinic[];
    } catch {
        return [];
    }
}

export async function getNonEhrFiles(): Promise<NonEhrFile[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_FILES);
        if (!raw) return [];
        return JSON.parse(raw) as NonEhrFile[];
    } catch {
        return [];
    }
}

export async function getFilesForProvider(providerId: string): Promise<NonEhrFile[]> {
    const all = await getNonEhrFiles();
    return all.filter(f => f.providerId === providerId);
}

// ─────────────────────────────────────────────
// Public API – Write (upload)
// ─────────────────────────────────────────────

/**
 * Process one or more uploaded files.
 *
 * Phase 1 – Extract data from ALL files in parallel (AI + text heuristics).
 * Phase 2 – Deduplicate providers/clinics across the WHOLE batch before writing.
 *           This prevents each image from spawning a separate "Unknown Provider".
 *
 * @param files   Array of file descriptors
 * @param options optional parameters like maxFiles or targetProviderId
 */
export async function processAndStoreFiles(
    files: Array<{
        name: string;
        uri: string;
        mimeType: string;
        size: number;
    }>,
    options?: {
        maxFiles?: number;
        targetProviderId?: string;
    }
): Promise<UploadResult[]> {
    const maxFiles = options?.maxFiles ?? 10;
    const targetProviderId = options?.targetProviderId;

    if (files.length > maxFiles) {
        return [{
            added: false,
            isDuplicate: false,
            providers: [],
            message: `You can upload a maximum of ${maxFiles} files at a time.`,
        }];
    }

    const [existingProviders, existingFiles, existingClinics] = await Promise.all([
        getNonEhrProviders(),
        getNonEhrFiles(),
        getNonEhrClinics(),
    ]);

    const results: UploadResult[] = [];

    // ── Phase 1: Extract files SEQUENTIALLY (avoids 429 rate limits) ─────────
    // We also track a "batchContext" — the first file that successfully returns
    // a real clinic name + provider name(s) becomes the anchor for ALL other
    // files in this upload session that don't have their own info.
    // This means 10 images from the same clinic visit → one provider entry.
    type FileExtraction = {
        file: typeof files[0];
        contentHash: string;
        parsed: ProcessedFileResult;
        isDuplicate: boolean;
    };

    const batchContext = {
        clinicName: '',       // filled by first file that has real clinic info
        providerNames: [] as string[], // filled by first file that has real provider names
        specialty: undefined as string | undefined,
        phone: undefined as string | undefined,
        address: undefined as string | undefined,
    };

    const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

    const extractions: FileExtraction[] = [];
    for (const file of files) {
        const contentHash = computeContentHash(file.name, file.size, file.uri);
        console.log(`[NonEhrProcessor] Phase1 – processing: ${file.name}`);

        if (existingFiles.some(f => f.contentHash === contentHash)) {
            extractions.push({ file, contentHash, parsed: { clinicName: '', providerNames: [], notes: [] } as ProcessedFileResult, isDuplicate: true });
            continue;
        }

        const rawText = await extractTextFromFile(file.uri, file.mimeType ?? 'text/plain');
        let parsed = parseProviderInfoFromText(rawText, file.name);

        // Try AI for every non-plain-text file or when heuristics returned nothing useful.
        // We skip AI for files whose text parsing already found a real provider name.
        const hasGoodTextResult = parsed.providerNames.length > 0 && parsed.clinicName !== 'Unknown Clinic';
        const needsAi = !hasGoodTextResult;

        if (needsAi) {
            try {
                console.log(`[NonEhrProcessor] Calling AI for: ${file.name}`);
                const aiResult = await extractProviderInfoWithAI(
                    file.uri,
                    file.mimeType ?? 'application/octet-stream',
                    file.name
                );
                if (aiResult) {
                    const goodClinic = aiResult.clinicName && aiResult.clinicName !== 'Unknown Clinic';
                    parsed = {
                        ...parsed,
                        clinicName: goodClinic ? aiResult.clinicName : parsed.clinicName,
                        providerNames: aiResult.providerNames.length > 0 ? aiResult.providerNames : parsed.providerNames,
                        specialty: aiResult.specialty ?? parsed.specialty,
                        phone: aiResult.phone ?? parsed.phone,
                        address: aiResult.address ?? parsed.address,
                        notes: (aiResult.notes && aiResult.notes.length > 0) ? aiResult.notes : (parsed.notes ?? []),
                    };
                    console.log(`[NonEhrProcessor] AI OK → clinic="${parsed.clinicName}" providers=[${parsed.providerNames.join(', ')}]`);
                }
            } catch (aiErr) {
                console.warn('[NonEhrProcessor] AI failed for', file.name, '– will use batch context:', aiErr);
            }
            // Small delay between AI calls to avoid rate limit bursts
            await sleep(300);
        }

        // ── Update batch context with the best info found so far ─────────
        const hasRealClinic = parsed.clinicName && parsed.clinicName !== 'Unknown Clinic';
        const hasRealProviders = parsed.providerNames.length > 0;
        if (hasRealClinic && !batchContext.clinicName) {
            batchContext.clinicName = parsed.clinicName;
            batchContext.specialty = parsed.specialty;
            batchContext.phone = parsed.phone;
            batchContext.address = parsed.address;
        }
        if (hasRealProviders && batchContext.providerNames.length === 0) {
            batchContext.providerNames = [...parsed.providerNames];
        }

        // ── Inherit batch context for files that returned nothing useful ──
        // This is the key logic: images with no text inherit clinic/provider
        // from the PDF or document that was uploaded alongside them.
        if (!hasRealClinic && batchContext.clinicName) {
            parsed.clinicName = batchContext.clinicName;
            if (!parsed.specialty) parsed.specialty = batchContext.specialty;
            if (!parsed.phone) parsed.phone = batchContext.phone;
            if (!parsed.address) parsed.address = batchContext.address;
        }
        if (!hasRealProviders && batchContext.providerNames.length > 0) {
            parsed.providerNames = [...batchContext.providerNames];
        }

        // Final fallback: all-unknown files still group together under one "Unknown Provider"
        if (!parsed.clinicName || parsed.clinicName === 'Unknown Clinic') parsed.clinicName = 'Unknown Clinic';
        // Leave providerNames empty — Phase 2 will assign 'Unknown Provider' as one shared entry

        extractions.push({ file, contentHash, parsed, isDuplicate: false });
    }



    // ── Phase 2: Deduplicate across WHOLE BATCH then persist ──────────────
    // Shared maps so file A and file B both referencing the same clinic/provider collapse.
    const workingClinicsMap = new Map<string, NonEhrClinic>();
    const workingProvidersMap = new Map<string, NonEhrProvider>(); // "clinicId||normName" → provider

    for (const c of existingClinics) workingClinicsMap.set(c.name.toLowerCase().trim(), c);
    for (const p of existingProviders) workingProvidersMap.set(`${p.clinicId}||${normalizeName(p.providerName)}`, p);

    const now = new Date().toISOString();

    const stripSuffixes = (name: string) =>
        name.toLowerCase().trim()
            .replace(/\b(clinic|medical group|hospital|center|centre|practice|associates|health system|wellness|care|health)\b/gi, '')
            .replace(/\s+/g, ' ').trim();

    const getOrCreateClinic = (clinicName: string, parsed: ProcessedFileResult): NonEhrClinic => {
        const normFull = clinicName.toLowerCase().trim();
        const normStripped = stripSuffixes(clinicName);

        let existing = workingClinicsMap.get(normFull);
        if (!existing && normStripped) existing = workingClinicsMap.get(normStripped);
        if (!existing && normStripped.length > 3) {
            for (const [key, clinic] of workingClinicsMap.entries()) {
                if (stripSuffixes(key) === normStripped) { existing = clinic; break; }
            }
        }
        if (existing) return existing;

        const newClinic: NonEhrClinic = {
            id: generateId(), name: clinicName,
            phone: parsed.phone, email: parsed.email, address: parsed.address,
            createdAt: now, updatedAt: now,
        };
        workingClinicsMap.set(normFull, newClinic);
        if (normStripped && normStripped !== normFull) workingClinicsMap.set(normStripped, newClinic);
        existingClinics.push(newClinic);
        return newClinic;
    };

    const getOrCreateProvider = (providerName: string, clinic: NonEhrClinic, parsed: ProcessedFileResult): NonEhrProvider => {
        const normProv = normalizeName(providerName);
        const exactKey = `${clinic.id}||${normProv}`;
        if (workingProvidersMap.has(exactKey)) return workingProvidersMap.get(exactKey)!;

        // Fuzzy match within the same clinic
        for (const [, p] of workingProvidersMap.entries()) {
            if (p.clinicId === clinic.id && namesMatch(p.providerName, providerName)) {
                workingProvidersMap.set(exactKey, p); // cache alias
                return p;
            }
        }

        const newProvider: NonEhrProvider = {
            id: generateId(), providerName,
            clinicId: clinic.id, clinicName: clinic.name,
            specialty: parsed.specialty, phone: parsed.phone,
            email: parsed.email, address: parsed.address,
            createdAt: now, updatedAt: now,
            fileIds: [], appointments: [], notes: [],
        };
        workingProvidersMap.set(exactKey, newProvider);
        existingProviders.push(newProvider);
        return newProvider;
    };

    const mergeNotes = (provider: NonEhrProvider, notes: Omit<NonEhrNote, 'id'>[] | undefined) => {
        if (!notes) return;
        for (const note of notes) {
            if (provider.notes.some(n => n.content === note.content && n.date === note.date)) continue;
            provider.notes.push({ ...note, id: generateId() });
            if (!provider.appointments.some(a => a.date === note.date)) {
                provider.appointments.push({ id: generateId(), date: note.date, type: 'Office Visit', status: 'Previous', notes: note.content });
            }
        }
    };

    for (const extraction of extractions) {
        const { file, contentHash, parsed, isDuplicate } = extraction;

        if (isDuplicate) {
            const dupFile = existingFiles.find(f => f.contentHash === contentHash);
            const owner = dupFile ? existingProviders.find(p => p.id === dupFile.providerId) : undefined;
            results.push({
                added: false, isDuplicate: true, providers: owner ? [owner] : [],
                message: `"${file.name}" has already been uploaded${owner ? ` for ${owner.providerName}` : ''}.`
            });
            continue;
        }

        // Anchored upload (from provider detail screen)
        if (targetProviderId) {
            const target = existingProviders.find(p => p.id === targetProviderId);
            if (target) {
                mergeNotes(target, parsed.notes);
                target.updatedAt = now;
                const newFile: NonEhrFile = {
                    id: generateId(), fileName: file.name,
                    mimeType: file.mimeType ?? 'application/octet-stream',
                    size: file.size, uri: file.uri, uploadedAt: now, contentHash,
                    providerId: target.id, clinicId: target.clinicId,
                };
                existingFiles.push(newFile);
                target.fileIds.push(newFile.id);
                results.push({
                    added: true, isDuplicate: false, providers: [target],
                    message: `"${file.name}" attached to ${target.providerName}.`
                });
                continue;
            }
        }

        // Normal flow
        const clinic = getOrCreateClinic(parsed.clinicName, parsed);
        const fileProviders: NonEhrProvider[] = [];

        // Ensure there is at least one provider name to attach the file to.
        // If providerNames is still empty (all AI calls failed AND no batchContext),
        // fall back to a single shared 'Unknown Provider' so all such files land together.
        const providerNamesToProcess = parsed.providerNames.length > 0
            ? parsed.providerNames
            : ['Unknown Provider'];

        for (const providerName of providerNamesToProcess) {
            const provider = getOrCreateProvider(providerName, clinic, parsed);
            provider.updatedAt = now;
            if (!provider.specialty && parsed.specialty) provider.specialty = parsed.specialty;
            mergeNotes(provider, parsed.notes);

            if (fileProviders.length === 0) {
                const newFile: NonEhrFile = {
                    id: generateId(), fileName: file.name,
                    mimeType: file.mimeType ?? 'application/octet-stream',
                    size: file.size, uri: file.uri, uploadedAt: now, contentHash,
                    providerId: provider.id, clinicId: clinic.id,
                };
                existingFiles.push(newFile);
                provider.fileIds.push(newFile.id);
            }
            fileProviders.push(provider);
        }

        results.push({
            added: true, isDuplicate: false, providers: fileProviders, clinic,
            message: `Processed "${file.name}".`
        });
    }

    // ── Persist all changes atomically ────────────────────────────────────
    await Promise.all([
        saveProviders(existingProviders),
        saveFiles(existingFiles),
        saveClinics(existingClinics),
    ]);

    return results;
}


// ─────────────────────────────────────────────
// Public API – Updates
// ─────────────────────────────────────────────

export async function updateNonEhrProvider(
    providerId: string,
    updates: Partial<Pick<NonEhrProvider, 'focusOfSupport' | 'phone' | 'email' | 'address' | 'providerName' | 'clinicName' | 'specialty'>>
): Promise<NonEhrProvider | null> {
    const now = new Date().toISOString();
    const [providers, clinics] = await Promise.all([getNonEhrProviders(), getNonEhrClinics()]);
    const index = providers.findIndex(p => p.id === providerId);
    if (index === -1) return null;

    const originalClinicId = providers[index].clinicId;
    providers[index] = {
        ...providers[index],
        ...updates,
        updatedAt: now,
    };

    // If the clinic name changed, update the NonEhrClinic record AND sync the
    // denormalised clinicName field on all sibling providers that share the same clinic.
    if (updates.clinicName) {
        const clinicIdx = clinics.findIndex(c => c.id === originalClinicId);
        if (clinicIdx !== -1) {
            clinics[clinicIdx].name = updates.clinicName;
            clinics[clinicIdx].updatedAt = now;
            if (updates.phone && !clinics[clinicIdx].phone) clinics[clinicIdx].phone = updates.phone;
            if (updates.address && !clinics[clinicIdx].address) clinics[clinicIdx].address = updates.address;
        }

        // Sync clinicName on siblings (providers with the same clinicId, excluding this one)
        for (let i = 0; i < providers.length; i++) {
            if (i !== index && providers[i].clinicId === originalClinicId) {
                providers[i].clinicName = updates.clinicName!;
                providers[i].updatedAt = now;
            }
        }
    }

    await Promise.all([saveProviders(providers), saveClinics(clinics)]);
    return providers[index];
}

export async function addNoteToNonEhrProvider(
    providerId: string,
    content: string
): Promise<NonEhrNote | null> {
    const providers = await getNonEhrProviders();
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return null;

    const note: NonEhrNote = {
        id: generateId(),
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        content,
        createdAt: new Date().toISOString(),
    };

    provider.notes.push(note);
    provider.updatedAt = new Date().toISOString();

    await saveProviders(providers);
    return note;
}

export async function upsertAppointmentForNonEhrProvider(
    providerId: string,
    appointment: Omit<NonEhrAppointment, 'id'> & { id?: string }
): Promise<NonEhrAppointment | null> {
    const providers = await getNonEhrProviders();
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return null;

    if (appointment.id) {
        const idx = provider.appointments.findIndex(a => a.id === appointment.id);
        if (idx !== -1) {
            provider.appointments[idx] = { ...provider.appointments[idx], ...appointment } as NonEhrAppointment;
        }
    } else {
        const newApt: NonEhrAppointment = { ...appointment, id: generateId() };
        provider.appointments.push(newApt);
    }

    provider.updatedAt = new Date().toISOString();
    await saveProviders(providers);

    const saved = provider.appointments.find(
        a => !appointment.id || a.id === appointment.id
    );
    return saved ?? null;
}

// ─────────────────────────────────────────────
// Public API – Deletes
// ─────────────────────────────────────────────

export async function deleteNonEhrProvider(providerId: string): Promise<boolean> {
    const [providers, files] = await Promise.all([getNonEhrProviders(), getNonEhrFiles()]);

    const providerIndex = providers.findIndex(p => p.id === providerId);
    if (providerIndex === -1) return false;

    providers.splice(providerIndex, 1);
    const remainingFiles = files.filter(f => f.providerId !== providerId);

    await Promise.all([saveProviders(providers), saveFiles(remainingFiles)]);
    return true;
}

export async function deleteNonEhrFile(fileId: string): Promise<boolean> {
    const [providers, files] = await Promise.all([getNonEhrProviders(), getNonEhrFiles()]);

    const fileIndex = files.findIndex(f => f.id === fileId);
    if (fileIndex === -1) return false;

    const { providerId } = files[fileIndex];
    files.splice(fileIndex, 1);

    const provider = providers.find(p => p.id === providerId);
    if (provider) {
        provider.fileIds = provider.fileIds.filter(id => id !== fileId);
        provider.updatedAt = new Date().toISOString();
    }

    await Promise.all([saveProviders(providers), saveFiles(files)]);
    return true;
}

/** Clear ALL non-EHR data (providers + clinics + files). Useful for testing / reset flows. */
export async function clearAllNonEhrData(): Promise<void> {
    await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEY_PROVIDERS),
        AsyncStorage.removeItem(STORAGE_KEY_FILES),
        AsyncStorage.removeItem(STORAGE_KEY_CLINICS),
    ]);
}
