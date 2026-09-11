import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Scanner } from "../scanner.js";
import type { SecurityFinding } from "../types.js";

const SECRET_PATTERNS = [
    {
        ruleId: "SECRET-GENERIC-001",
        pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})/i,
        title: "Potential hardcoded API key",
        severity: "high" as const,
    },
    {
        ruleId: "SECRET-GENERIC-002",
        pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"']+)["']/i,
        title: "Potential hardcoded password",
        severity: "high" as const,
    },
    {
        ruleId: "SECRET-AWS-001",
        pattern: /AKIA[0-9A-Z]{16}/,
        title: "Potential AWS access key",
        severity: "critical" as const,
    },
    {
        ruleId: "SECRET-SUPABASE-001",
        pattern:
            /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY)\s*=\s*["']?([^"'\s]+)["']?/i,
        title: "Supabase service role key",
        severity: "critical" as const,
    },
    {
        ruleId: "SECRET-SUPABASE-002",
        pattern:
            /VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^"'\s]+)["']?/i,
        title: "Supabase anonymous key exposed",
        severity: "low" as const,
    },
];

const IGNORED_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
]);

async function walkDirectory(directory: string): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");

    const entries = await readdir(directory, {
        withFileTypes: true,
    });

    const files: string[] = [];

    for (const entry of entries) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
            continue;
        }

        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...(await walkDirectory(fullPath)));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

export const secretScanner: Scanner = {
    name: "secret-scanner",

    async scan(repositoryPath) {
        const findings: SecurityFinding[] = [];

        const files = await walkDirectory(repositoryPath);
        console.log(`Scanner found ${files.length} files`);
        for (const filePath of files) {
            let content: string;
            if (filePath.endsWith(".env")) {
                console.log("Found .env file:", filePath);
            }
            try {
                content = await readFile(filePath, "utf8");
            } catch {
                continue;
            }

            const lines = content.split(/\r?\n/);

            for (let index = 0; index < lines.length; index++) {
                const line = lines[index];
                if (filePath.endsWith(".env")) {
                    console.log(
                        `Scanning .env line ${index + 1}, length=${line.length}`
                    );
                }
                for (const rule of SECRET_PATTERNS) {
                    if (rule.pattern.test(line)) {
                        console.log(
                            `SECRET MATCH: ${rule.ruleId} in ${filePath} line ${index + 1}`
                        );
                        findings.push({
                            category: "secret",
                            severity: rule.severity,
                            title: rule.title,
                            description:
                                "A potential hardcoded credential was detected in source code.",
                            filePath: filePath.replace(repositoryPath, ""),
                            lineNumber: index + 1,

                            // Don't store the actual secret.
                            evidence: "[REDACTED]",

                            remediation:
                                "Remove the credential from source code, revoke or rotate it, and store secrets using a secure secret-management mechanism.",

                            ruleId: rule.ruleId,

                            confidence: 0.8,
                        });
                    }
                }
            }
        }

        return findings;
    },
};