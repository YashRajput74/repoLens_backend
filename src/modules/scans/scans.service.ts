import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { findings, projects, scans } from "../../db/schema/index.js";
import {
    cloneRepository,
    removeRepository,
} from "../../services/repository.service.js";
import { secretScanner } from "../../scanners/secrets/secrets.scanner.js";

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

        repositoryPath = await cloneRepository(repositoryUrl);

        const secretFindings = await secretScanner.scan(repositoryPath);

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