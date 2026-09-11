import { FastifyInstance } from "fastify";
import { createProject } from "./projects.service.js";

export async function projectRoutes(app: FastifyInstance) {
    app.post("/api/projects", async (request, reply) => {
        const body = request.body as {
            name: string;
            repositoryUrl: string;
        };

        const project = await createProject(body);

        return reply.status(201).send({
            success: true,
            data: project,
        });
    });
}