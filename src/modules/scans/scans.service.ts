import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { findings, projects, scans } from "../../db/schema/index.js";
import {
    cloneRepository,
    removeRepository,
} from "../../services/repository.service.js";
import { secretScanner } from "../../scanners/secrets/secrets.scanner.js";
import {
    buildRepositoryStructure,
    buildSelectedFileContextBatches,
} from "../../services/repository-context.service.js";

import {
    selectSecurityFiles,
    analyzeRepository,
} from "../../services/groq.service.js";

export async function createScan(projectId: string) {
    const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

    if (!project) {
        throw new Error("Project not found");
    }

    const [scan] = await db
        .insert(scans)
        .values({
            projectId,
            status: "queued",
        })
        .returning();

    runScan(scan.id, project.repositoryUrl).catch(async (error) => {
        console.error("Scan failed:", error);

        await db
            .update(scans)
            .set({
                status: "failed",
                completedAt: new Date(),
            })
            .where(eq(scans.id, scan.id));
    });

    return scan;
}

async function runScan(scanId: string, repositoryUrl: string) {
    let repositoryPath: string | undefined;

    try {
        await db
            .update(scans)
            .set({
                status: "running",
                startedAt: new Date(),
            })
            .where(eq(scans.id, scanId));

        // 1. Clone repository
        repositoryPath = await cloneRepository(repositoryUrl);

        // 2. Get repository structure
        const repositoryStructure =
            await buildRepositoryStructure(repositoryPath);

        console.log("===== REPOSITORY STRUCTURE =====");
        console.log(repositoryStructure);
        console.log("================================");

        // 3. Ask Groq which files are security-relevant
        const selectedFiles =
            await selectSecurityFiles(repositoryStructure);

        console.log("===== AI SELECTED FILES =====");
        console.log(selectedFiles);
        console.log("=============================");

        // 4. Build token-aware batches from selected files
        const repositoryContextBatches =
            await buildSelectedFileContextBatches(
                repositoryPath,
                selectedFiles,
            );

        console.log(
            `===== AI CONTEXT BATCHES: ${repositoryContextBatches.length} =====`,
        );

        repositoryContextBatches.forEach((batch, index) => {
            console.log(
                `Batch ${index + 1}: ${batch.length} characters`,
            );
        });

        console.log("========================================");

        // 5. Analyze each batch separately
        const aiAnalyses: string[] = [];

        for (let i = 0; i < repositoryContextBatches.length; i++) {
            const batch = repositoryContextBatches[i];

            console.log(
                `===== ANALYZING BATCH ${i + 1}/${repositoryContextBatches.length} =====`,
            );

            const analysis = await analyzeRepository(batch);

            aiAnalyses.push(analysis);

            console.log(analysis);

            console.log(
                `===== END BATCH ${i + 1} =====`,
            );
        }

        // 6. Combine all AI analysis results
        const aiAnalysis = aiAnalyses.join(
            "\n\n===== NEXT ANALYSIS BATCH =====\n\n",
        );

        console.log("===== COMPLETE GROQ SECURITY ANALYSIS =====");
        console.log(aiAnalysis);
        console.log("============================================");

        // 6. Existing secret scanner
        const secretFindings =
            await secretScanner.scan(repositoryPath);

        if (secretFindings.length > 0) {
            await db.insert(findings).values(
                secretFindings.map((finding) => ({
                    scanId,
                    category: finding.category,
                    severity: finding.severity,
                    title: finding.title,
                    description: finding.description,
                    filePath: finding.filePath,
                    lineNumber: finding.lineNumber,
                    evidence: finding.evidence,
                    remediation: finding.remediation,
                    ruleId: finding.ruleId,
                    cwe: finding.cwe,
                    cve: finding.cve,
                    confidence: finding.confidence,
                })),
            );
        }

        // 7. Mark scan completed
        await db
            .update(scans)
            .set({
                status: "completed",
                completedAt: new Date(),
            })
            .where(eq(scans.id, scanId));
    } finally {
        if (repositoryPath) {
            await removeRepository(repositoryPath);
        }
    }
}