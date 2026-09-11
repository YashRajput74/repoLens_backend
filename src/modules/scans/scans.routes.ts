import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { findings, scans } from "../../db/schema/index.js";
import { createScan } from "./scans.service.js";

export async function scanRoutes(app: FastifyInstance) {
    app.post("/api/projects/:projectId/scans", async (request, reply) => {
        const { projectId } = request.params as {
            projectId: string;
        };

        const scan = await createScan(projectId);

        return reply.status(202).send({
            success: true,
            data: scan,
        });
    });

    app.get("/api/scans/:scanId", async (request, reply) => {
        const { scanId } = request.params as {
            scanId: string;
        };

        const [scan] = await db
            .select()
            .from(scans)
            .where(eq(scans.id, scanId));

        if (!scan) {
            return reply.status(404).send({
                success: false,
                message: "Scan not found",
            });
        }

        return {
            success: true,
            data: scan,
        };
    });

    app.get("/api/scans/:scanId/findings", async (request) => {
        const { scanId } = request.params as {
            scanId: string;
        };

        const scanFindings = await db
            .select()
            .from(findings)
            .where(eq(findings.scanId, scanId));

        return {
            success: true,
            data: scanFindings,
        };
    });
}