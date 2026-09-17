import {
    cruise,
    type ICruiseResult,
} from "dependency-cruiser";

export type DependencyGraph = Record<
    string,
    {
        dependencies: string[];
        dependents: string[];
    }
>;

export async function buildDependencyGraph(
    repositoryPath: string,
): Promise<DependencyGraph> {
    const result = await cruise(
        ["."],
        {
            baseDir: repositoryPath,

            doNotFollow: {
                path: [
                    "node_modules",
                    "\\.git",
                    "dist",
                    "build",
                    "\\.next",
                    "coverage",
                ],
            },

            exclude: [
                "\\.(css|scss)$",
            ],
        },
    );

    const cruiseResult =
        result.output as ICruiseResult;

    const graph: DependencyGraph = {};

    for (const module of cruiseResult.modules) {
        const source =
            normalizePath(module.source);

        if (!graph[source]) {
            graph[source] = {
                dependencies: [],
                dependents: [],
            };
        }

        for (const dependency of module.dependencies) {
            if (
                dependency.resolved &&
                dependency.followable
            ) {
                const target =
                    normalizePath(
                        dependency.resolved,
                    );

                if (
                    !graph[source].dependencies.includes(
                        target,
                    )
                ) {
                    graph[source].dependencies.push(
                        target,
                    );
                }

                if (!graph[target]) {
                    graph[target] = {
                        dependencies: [],
                        dependents: [],
                    };
                }

                if (
                    !graph[target].dependents.includes(
                        source,
                    )
                ) {
                    graph[target].dependents.push(
                        source,
                    );
                }
            }
        }
    }

    return graph;
}

function normalizePath(
    filePath: string,
): string {
    return filePath.replace(/\\/g, "/");
}

export function expandSecurityContext(
    selectedFiles: string[],
    dependencyGraph: DependencyGraph,
): string[] {
    const expandedFiles = new Set<string>();

    for (const file of selectedFiles) {
        const normalizedFile = normalizePath(file);

        // Always keep the file selected by the AI
        expandedFiles.add(normalizedFile);

        const node = dependencyGraph[normalizedFile];

        if (!node) {
            continue;
        }

        // Direct dependencies
        for (const dependency of node.dependencies) {
            expandedFiles.add(dependency);
        }

        // Direct dependents
        for (const dependent of node.dependents) {
            expandedFiles.add(dependent);
        }
    }

    return [...expandedFiles];
}