import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";

// Read .env.local manually
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const keyId = process.env.B2_KEY_ID;
const appKey = process.env.B2_APPLICATION_KEY;
const bucket = process.env.B2_BUCKET;
let endpoint = process.env.B2_ENDPOINT || "s3.us-east-005.backblazeb2.com";
const region = process.env.B2_REGION || "us-east-005";

if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
  endpoint = `https://${endpoint}`;
}

console.log("Bucket:", bucket);
console.log("Endpoint:", endpoint);

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: keyId,
    secretAccessKey: appKey,
  },
});

async function run() {
  console.log("\n1. Fetching current CORS rules on B2 bucket...");
  try {
    const existing = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log("Current CORS rules:", JSON.stringify(existing.CORSRules, null, 2));
  } catch (err) {
    console.log("Could not get existing CORS rules (might be none configured):", err.message);
  }

  console.log("\n2. Applying permissive CORS rules to allow direct browser uploads & downloads...");
  try {
    const putCorsCmd = new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST", "HEAD", "DELETE"],
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag", "x-amz-server-side-encryption"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    });
    await client.send(putCorsCmd);
    console.log("Successfully updated CORS rules on Backblaze B2 bucket!");

    console.log("\n3. Verifying updated CORS rules...");
    const verify = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log("Verified CORS rules on B2:", JSON.stringify(verify.CORSRules, null, 2));
  } catch (err) {
    console.error("Failed to set CORS rules via S3 API:", err);
  }
}

run();
