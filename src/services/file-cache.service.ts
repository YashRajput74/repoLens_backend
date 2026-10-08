import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { fileAnalysisCache } from "../db/schema/index.js";
import type { SecurityFinding } from "../scanners/types.js";

export interface FileCacheEntry {
    filePath: string;
    hash: string;
    tokenCount: number;
}

export function hashFileContent(
    content: string,
): string {
    return createHash("sha256")
        .update(content, "utf8")
        .digest("hex");
}

export async function getCachedAnalysis(
    repositoryUrl: string,
    filePath: string,
    hash: string,
): Promise<string | null> {
    const result = await db
        .select({
            analysis: fileAnalysisCache.analysis,
        })
        .from(fileAnalysisCache)
        .where(
            and(
                eq(
                    fileAnalysisCache.repositoryUrl,
                    repositoryUrl,
                ),
                eq(
                    fileAnalysisCache.filePath,
                    filePath,
                ),
                eq(
                    fileAnalysisCache.contentHash,
                    hash,
                ),
            ),
        )
        .limit(1);

    return result[0]?.analysis ?? null;
}

export async function saveAnalysis(
    repositoryUrl: string,
    filePath: string,
    hash: string,
    analysis: string,
): Promise<void> {
    const existing = await getCachedAnalysis(repositoryUrl, filePath, hash);
    if (existing !== null) {
        return;
    }

    await db.insert(fileAnalysisCache).values({
        repositoryUrl,
        filePath,
        contentHash: hash,
        analysis,
    });
}

export async function getCachedFindings(
    repositoryUrl: string,
    filePath: string,
    hash: string,
): Promise<SecurityFinding[] | null> {
    const cachedAnalysis = await getCachedAnalysis(
        repositoryUrl,
        filePath,
        hash,
    );

    if (cachedAnalysis === null) {
        return null;
    }

    try {
        const parsed = JSON.parse(cachedAnalysis);
        return Array.isArray(parsed) ? (parsed as SecurityFinding[]) : [];
    } catch (error) {
        console.warn(
            `Failed to parse cached analysis for ${filePath}:`,
            error,
        );
        return null;
    }
}

export async function saveCachedFindings(
    repositoryUrl: string,
    filePath: string,
    hash: string,
    findings: SecurityFinding[],
): Promise<void> {
    await saveAnalysis(
        repositoryUrl,
        filePath,
        hash,
        JSON.stringify(findings),
    );
}