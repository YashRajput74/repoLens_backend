import Groq from "groq-sdk";
import { env } from "../config/env.js";
import type { SecurityFinding } from "../scanners/types.js";

const groq = new Groq({
    apiKey: env.GROQ_API_KEY,
});

export async function selectSecurityFiles(
    repositoryStructure: string,
): Promise<string[]> {
    if (!env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not configured");
    }

    const response = await groq.chat.completions.create({
        model: env.GROQ_MODEL,

        messages: [
            {
                role: "system",
                content:
                    "You are a cybersecurity code reviewer. Given a repository file structure, identify the files most relevant for finding serious security vulnerabilities. Return ONLY a JSON object with a single key named files. The value of files must be an array of file paths. Do not include explanations.",
            },
            {
                role: "user",
                content: `
Repository structure:

${repositoryStructure}

Select the files you need to inspect for serious security vulnerabilities.
`,
            },
        ],

        response_format: {
            type: "json_object",
        },
    });

    const content = response.choices[0]?.message?.content ?? "{}";

    const parsed = JSON.parse(content);

    return Array.isArray(parsed.files)
        ? parsed.files
        : [];
}
export async function analyzeRepository(
    repositoryContext: string,
): Promise<SecurityFinding[]> {
    const response = await groq.chat.completions.create({
        model: env.GROQ_MODEL,

        messages: [
            {
                role: "system",
                content: `
You are a cybersecurity code reviewer.

Analyze the provided source code for genuine security vulnerabilities.

Focus on:
- authentication and authorization issues
- exposed secrets or credentials
- insecure data handling
- injection vulnerabilities
- insecure API usage
- dangerous client/server configuration
- access control problems
- other serious security vulnerabilities

Return ONLY a JSON object with a single key named "findings".

The value of "findings" must be an array.

Each finding must have this structure:

{
    "category": "sast",
    "severity": "critical | high | medium | low | info",
    "title": "Short vulnerability title",
    "description": "Detailed explanation of the vulnerability",
    "filePath": "path/to/file",
    "lineNumber": 10,
    "evidence": "Relevant code or explanation of the vulnerable code",
    "remediation": "Specific recommendation to fix the vulnerability",
    "ruleId": "optional rule identifier",
    "cwe": "optional CWE identifier",
    "cve": "optional CVE identifier",
    "confidence": 0.95
}

Rules:
- category must be "sast".
- severity must be one of: critical, high, medium, low, info.
- confidence must be between 0 and 1.
- Do not invent vulnerabilities.
- Only report vulnerabilities supported by the provided code.
- filePath must refer to a file from the provided context.
- If there are no genuine vulnerabilities, return an empty findings array.
- Return JSON only. Do not include markdown or explanations outside the JSON object.
`,
            },
            {
                role: "user",
                content: `
Analyze these selected repository files:

${repositoryContext}
`,
            },
        ],

        response_format: {
            type: "json_object",
        },
    });

    const content =
        response.choices[0]?.message?.content ??
        '{"findings":[]}';

    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed.findings)) {
        return [];
    }

    return parsed.findings as SecurityFinding[];
}