import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { projectRoutes } from "./modules/projects/projects.routes.js";
import { scanRoutes } from "./modules/scans/scans.routes.js";

const app = Fastify({
    logger: true,
});

app.get("/api/health", async () => {
    const result = await db.execute(sql`SELECT NOW()`);

    return {
        success: true,
        message: "repoLens API is running",
        databaseTime: result.rows[0].now,
        timestamp: new Date().toISOString(),
    };
});

app.register(projectRoutes);
app.register(scanRoutes);

export default app;