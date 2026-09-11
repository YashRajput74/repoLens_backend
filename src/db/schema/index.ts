import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    text,
    integer,
    real,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
    id: uuid("id").defaultRandom().primaryKey(),

    name: varchar("name", { length: 255 }).notNull(),

    repositoryUrl: varchar("repository_url", {
        length: 500,
    }).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),

    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const scans = pgTable("scans", {
    id: uuid("id").defaultRandom().primaryKey(),

    projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id),

    status: varchar("status", { length: 20 })
        .notNull()
        .default("queued"),

    startedAt: timestamp("started_at"),

    completedAt: timestamp("completed_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const findings = pgTable("findings", {
    id: uuid("id").defaultRandom().primaryKey(),

    scanId: uuid("scan_id")
        .notNull()
        .references(() => scans.id),

    category: varchar("category", { length: 30 }).notNull(),

    severity: varchar("severity", { length: 20 }).notNull(),

    title: varchar("title", { length: 255 }).notNull(),

    description: text("description").notNull(),

    filePath: varchar("file_path", { length: 1000 }),

    lineNumber: integer("line_number"),

    evidence: text("evidence"),

    remediation: text("remediation"),

    ruleId: varchar("rule_id", { length: 100 }),

    cwe: varchar("cwe", { length: 50 }),

    cve: varchar("cve", { length: 50 }),

    confidence: real("confidence"),

    status: varchar("status", { length: 30 })
        .notNull()
        .default("open"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
});