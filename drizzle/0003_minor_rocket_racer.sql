CREATE TABLE "file_analysis_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_url" varchar(500) NOT NULL,
	"file_path" varchar(1000) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"analysis" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
