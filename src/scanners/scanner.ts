import type { SecurityFinding } from "./types.js";

export interface Scanner {
    name: string;

    scan(repositoryPath: string): Promise<SecurityFinding[]>;
}