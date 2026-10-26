// Creates the S3 bucket (if missing) and lets the browser upload to it from APP_URL. Run once: pnpm storage:setup
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const path = join(root, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const bucket = process.env.S3_BUCKET;
if (!bucket) {
  console.error("S3_BUCKET is not set.");
  process.exit(1);
}
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || undefined,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
});

try {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`bucket ${bucket} exists`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`created bucket ${bucket}`);
}

// APP_URL plus any extra origins (comma-separated S3_CORS_ORIGINS), e.g. a preview deployment.
const origins = [
  process.env.APP_URL || "http://localhost:3000",
  ...(process.env.S3_CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
];
try {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["*"], MaxAgeSeconds: 3600 }],
      },
    }),
  );
  console.log(`CORS: PUT allowed from ${origins.join(", ")}`);
} catch (error) {
  console.warn(`Could not set CORS (${error.name}). Allow PUT from ${origins.join(", ")} in your provider's dashboard.`);
}
