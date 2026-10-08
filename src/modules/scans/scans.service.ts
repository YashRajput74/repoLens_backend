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
    loadSelectedFiles,
    buildFileBatches,
    normalizeFilePath,
    type FileContext,
} from "../../services/repository-context.service.js";
import {
    getCachedFindings,
    saveCachedFindings,
} from "../../services/file-cache.service.js";
import {
    buildDependencyGraph,
    expandSecurityContext,
} from "../../services/dependency-graph.service.js";
import {
    selectSecurityFiles,
    analyzeRepository,
} from "../../services/groq.service.js";
import type { SecurityFinding } from "../../scanners/types.js";

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

        // TEST: Build dependency graph
        const dependencyGraph =
            await buildDependencyGraph(repositoryPath);

        console.log(
            JSON.stringify(
                dependencyGraph,
                null,
                2,
            ),
        );

        // 2. Get repository structure
        const repositoryStructure =
            await buildRepositoryStructure(repositoryPath);

        // 3. Ask Groq which files are security-relevant
        const selectedFiles =
            await selectSecurityFiles(repositoryStructure);

        const securityContextFiles =
            expandSecurityContext(
                selectedFiles,
                dependencyGraph,
            );

        // 4. Load files and check cache
        const allFiles = await loadSelectedFiles(
            repositoryPath,
            securityContextFiles,
        );

        const aiFindings: SecurityFinding[] = [];
        const uncachedFiles: FileContext[] = [];

        for (const file of allFiles) {
            const cachedFindings = await getCachedFindings(
                repositoryUrl,
                file.path,
                file.hash,
            );

            if (cachedFindings !== null) {
                console.log(
                    `[Cache HIT] ${file.path} (${file.hash.slice(0, 8)}) - ${cachedFindings.length} finding(s)`,
                );
                aiFindings.push(...cachedFindings);
            } else {
                console.log(
                    `[Cache MISS] ${file.path} (${file.hash.slice(0, 8)})`,
                );
                uncachedFiles.push(file);
            }
        }

        // 5. Analyze uncached files in batches
        if (uncachedFiles.length > 0) {
            const batches = buildFileBatches(uncachedFiles);
            console.log(
                `Analyzing ${uncachedFiles.length} uncached file(s) across ${batches.length} batch(es)...`,
            );

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(
                    `Analyzing batch ${i + 1}/${batches.length} (${batch.files.length} file(s))...`,
                );

                const findingsFromBatch =
                    await analyzeRepository(batch.content);

                aiFindings.push(...findingsFromBatch);

                // Cache findings for each file in this batch
                for (const file of batch.files) {
                    const normalizedTarget =
                        normalizeFilePath(file.path).toLowerCase();
                    const fileFindings = findingsFromBatch.filter(
                        (f) =>
                            normalizeFilePath(f.filePath ?? "").toLowerCase() ===
                            normalizedTarget,
                    );

                    await saveCachedFindings(
                        repositoryUrl,
                        file.path,
                        file.hash,
                        fileFindings,
                    );
                }
            }
        } else {
            console.log(
                "All security-relevant files found in cache! Skipping AI calls.",
            );
        }
        // 6. Save AI findings
        if (aiFindings.length > 0) {
            await db.insert(findings).values(
                aiFindings.map((finding) => ({
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

        // 7. Existing secret scanner
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