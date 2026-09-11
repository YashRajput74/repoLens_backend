import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export async function cloneRepository(repositoryUrl: string) {
    const directory = await mkdtemp(join(tmpdir(), "repolens-"));

    try {
        await execFileAsync(
            "git",
            [
                "clone",
                "--depth",
                "1",
                "--",
                repositoryUrl,
                directory,
            ],
            {
                timeout: 120_000,
                maxBuffer: 10 * 1024 * 1024,
            },
        );

        return directory;
    } catch (error) {
        await rm(directory, {
            recursive: true,
            force: true,
        });

        throw error;
    }
}

export async function removeRepository(directory: string) {
    await rm(directory, {
        recursive: true,
        force: true,
    });
}