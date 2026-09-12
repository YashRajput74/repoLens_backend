import "dotenv/config";

export const env = {
    PORT: Number(process.env.PORT ?? 3000),

    DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgre@localhost:5432/repolens",

    GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
    GROQ_MODEL: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
};