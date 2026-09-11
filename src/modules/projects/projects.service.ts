import { db } from "../../db/client.js";
import { projects } from "../../db/schema/index.js";

interface CreateProjectInput {
    name: string;
    repositoryUrl: string;
}

export async function createProject(input: CreateProjectInput) {
    const [project] = await db
        .insert(projects)
        .values({
            name: input.name,
            repositoryUrl: input.repositoryUrl,
        })
        .returning();

    return project;
}