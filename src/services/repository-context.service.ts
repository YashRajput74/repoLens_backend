import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, extname, dirname } from "node:path";
import { encodingForModel } from "js-tiktoken";

const IGNORED_DIRECTORIES = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage",
]);

// Files that are useful for source/security analysis.
// Images, fonts, videos, etc. are deliberately excluded.
const ALLOWED_EXTENSIONS = new Set([
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".json",
    ".html",
    ".css",
    ".scss",
    ".env",
    ".yml",
    ".yaml",
    ".xml",
    ".md",
]);

// Don't allow one enormous file to dominate the context.
const MAX_FILE_SIZE = 100 * 1024; // 100 KB

// Keep comfortably below Groq's current 8K TPM limit.
export const MAX_BATCH_TOKENS = 5500;

const encoder = encodingForModel("gpt-4o");

async function collectFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, {
        withFileTypes: true,
    });

    const files: string[] = [];

    for (const entry of entries) {
        if (
            entry.isDirectory() &&
            IGNORED_DIRECTORIES.has(entry.name)
        ) {
            continue;
        }

        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...(await collectFiles(fullPath)));
        } else {
            const extension = extname(entry.name).toLowerCase();

            // Keep extensionless files such as .env.
            const isEnvFile =
                entry.name === ".env" ||
                entry.name.startsWith(".env.");

            if (
                !isEnvFile &&
                !ALLOWED_EXTENSIONS.has(extension)
            ) {
                continue;
            }

            files.push(fullPath);
        }
    }

    return files;
}

export async function buildRepositoryStructure(
    repositoryPath: string,
): Promise<string> {
    const files = await collectFiles(repositoryPath);

    return files
        .map((file) => relative(repositoryPath, file))
        .sort()
        .join("\n");
}

function estimateTokens(text: string): number {
    return encoder.encode(text).length;
}

function isSafePath(
    repositoryPath: string,
    filePath: string,
): boolean {
    const repositoryRoot = resolve(repositoryPath);
    const resolvedFile = resolve(repositoryPath, filePath);

    return (
        resolvedFile === repositoryRoot ||
        resolvedFile.startsWith(repositoryRoot + "\\") ||
        resolvedFile.startsWith(repositoryRoot + "/")
    );
}

interface FileContext {
    path: string;
    content: string;
    tokens: number;
}

async function loadSelectedFiles(
    repositoryPath: string,
    selectedFiles: string[],
): Promise<FileContext[]> {
    const files: FileContext[] = [];

    for (const file of selectedFiles) {
        if (!isSafePath(repositoryPath, file)) {
            console.log(`Skipping unsafe file path: ${file}`);
            continue;
        }

        const filePath = join(repositoryPath, file);

        try {
            const content = await readFile(filePath, "utf8");

            if (Buffer.byteLength(content, "utf8") > MAX_FILE_SIZE) {
                console.log(
                    `Skipping large file: ${file}`,
                );
                continue;
            }

            const formattedContent =
                `===== FILE: ${file} =====\n${content}`;

            const tokens = estimateTokens(formattedContent);

            files.push({
                path: file,
                content: formattedContent,
                tokens,
            });
        } catch {
            console.log(
                `Could not read selected file: ${file}`,
            );
        }
    }

    return files;
}

function getDirectory(filePath: string): string {
    const directory = dirname(filePath);

    return directory === "."
        ? "root"
        : directory;
}

export async function buildSelectedFileContextBatches(
    repositoryPath: string,
    selectedFiles: string[],
): Promise<string[]> {
    const files = await loadSelectedFiles(
        repositoryPath,
        selectedFiles,
    );

    // First group files by directory/module.
    const groups = new Map<string, FileContext[]>();

    for (const file of files) {
        const directory = getDirectory(file.path);

        if (!groups.has(directory)) {
            groups.set(directory, []);
        }

        groups.get(directory)!.push(file);
    }

    const batches: string[] = [];
    let currentBatch: FileContext[] = [];
    let currentTokens = 0;

    function flushBatch() {
        if (currentBatch.length === 0) {
            return;
        }

        batches.push(
            currentBatch
                .map((file) => file.content)
                .join("\n\n"),
        );

        currentBatch = [];
        currentTokens = 0;
    }

    for (const [, groupFiles] of groups) {
        const groupTokens = groupFiles.reduce(
            (total, file) => total + file.tokens,
            0,
        );

        // If the whole module fits, keep it together.
        if (
            currentTokens > 0 &&
            currentTokens + groupTokens > MAX_BATCH_TOKENS
        ) {
            flushBatch();
        }

        // A module may itself be larger than the batch limit.
        // In that case, split it file-by-file.
        for (const file of groupFiles) {
            if (
                currentTokens > 0 &&
                currentTokens + file.tokens > MAX_BATCH_TOKENS
            ) {
                flushBatch();
            }

            // A single file larger than the batch limit
            // cannot safely fit into the request.
            if (file.tokens > MAX_BATCH_TOKENS) {
                console.log(
                    `Skipping oversized file: ${file.path} (${file.tokens} tokens)`,
                );
                continue;
            }

            currentBatch.push(file);
            currentTokens += file.tokens;
        }
    }

    flushBatch();

    return batches;
}