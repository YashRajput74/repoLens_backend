import Groq from "groq-sdk";
import { env } from "../config/env.js";

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
) {
    const response = await groq.chat.completions.create({
        model: env.GROQ_MODEL,

        messages: [
            {
                role: "system",
                content:
                    "You are a cybersecurity code reviewer. Analyze the provided source code for serious security vulnerabilities. Identify critical and high-impact issues and explain how to fix them.",
            },
            {
                role: "user",
                content: `
Analyze these selected repository files:

${repositoryContext}
`,
            },
        ],
    });

    return response.choices[0]?.message?.content ?? "";
}