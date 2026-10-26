import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListMultipartUploadsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MULTIPART_THRESHOLD_BYTES, MULTIPART_PART_SIZE_BYTES } from "../constants";
import { formatContentDisposition } from "../utils";
import type {
  StorageProvider,
  CreateUploadResult,
  StoragePart,
  StaleMultipartUpload,
} from "./types";

export class B2Provider implements StorageProvider {
  public readonly name = "b2";
  private client: S3Client;
  private bucket: string;

  constructor() {
    const keyId = process.env.B2_KEY_ID;
    const appKey = process.env.B2_APPLICATION_KEY;
    const bucket = process.env.B2_BUCKET;
    let endpoint = process.env.B2_ENDPOINT || "s3.us-east-005.backblazeb2.com";
    const region = process.env.B2_REGION || "us-east-005";

    if (!keyId || !appKey || !bucket) {
      // In development or when testing without full credentials, warn
      console.warn(
        "B2Provider initialized without complete credentials (B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET)."
      );
    }

    if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
      endpoint = `https://${endpoint}`;
    }

    this.bucket = bucket || "";
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: keyId || "dummy-key-id",
        secretAccessKey: appKey || "dummy-app-key",
      },
    });
  }

  async createUpload({
    key,
    contentType,
    sizeBytes,
    partSize = MULTIPART_PART_SIZE_BYTES,
  }: {
    key: string;
    contentType: string;
    sizeBytes: number;
    partSize?: number;
  }): Promise<CreateUploadResult> {
    // If file is smaller than or equal to 100 MB, use single presigned PUT
    if (sizeBytes <= MULTIPART_THRESHOLD_BYTES) {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType || "application/octet-stream",
      });

      // 1 hour expiry for upload
      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: 3600,
      });

      return {
        mode: "single",
        uploadUrl,
        key,
      };
    }

    // For files > 100 MB, use S3 Multipart Upload with 10 MB parts
    // (B2 minimum part size is 5 MB, last part can be smaller)
    const effectivePartSize = Math.max(partSize, 5 * 1024 * 1024);
    const totalParts = Math.ceil(sizeBytes / effectivePartSize);

    const createCommand = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });

    const createRes = await this.client.send(createCommand);
    const uploadId = createRes.UploadId;

    if (!uploadId) {
      throw new Error("Failed to initialize multipart upload: No UploadId received from Backblaze B2");
    }

    // Generate presigned PUT URLs for each part (1..totalParts)
    const presignedParts = await Promise.all(
      Array.from({ length: totalParts }, async (_, idx) => {
        const partNumber = idx + 1;
        const partCommand = new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });

        const url = await getSignedUrl(this.client, partCommand, {
          expiresIn: 3600,
        });

        return { partNumber, url };
      })
    );

    return {
      mode: "multipart",
      uploadId,
      key,
      partSize: effectivePartSize,
      parts: presignedParts,
    };
  }

  async completeUpload({
    key,
    uploadId,
    parts,
  }: {
    key: string;
    uploadId: string;
    parts: StoragePart[];
  }): Promise<{ location?: string }> {
    // S3 requires parts to be sorted in ascending order by PartNumber
    const sortedParts = [...parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => ({
        PartNumber: p.partNumber,
        // Strip any surrounding quotes if present
        ETag: p.etag.replace(/^"|"$/g, ""),
      }));

    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    });

    const res = await this.client.send(completeCommand);
    return { location: res.Location };
  }

  async abortUpload({
    key,
    uploadId,
  }: {
    key: string;
    uploadId: string;
  }): Promise<void> {
    const abortCommand = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
    });

    await this.client.send(abortCommand);
  }

  async getDownloadUrl({
    key,
    originalFilename,
    expiresInSeconds = 300, // 5 minutes
  }: {
    key: string;
    originalFilename: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    // Preserve original filename on download via RFC 6266 / RFC 5987 content-disposition
    const disposition = formatContentDisposition("attachment", originalFilename);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: disposition,
    });

    return await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async uploadDirect({
    key,
    body,
    contentType,
  }: {
    key: string;
    body: Buffer | Uint8Array;
    contentType?: string;
  }): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    });

    await this.client.send(command);
  }

  async getObjectStream({
    key,
  }: {
    key: string;
  }): Promise<{ stream: unknown; contentType?: string; contentLength?: number }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const res = await this.client.send(command);
    return {
      stream: res.Body,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async listStaleMultipartUploads(olderThanHours = 24): Promise<StaleMultipartUpload[]> {
    const command = new ListMultipartUploadsCommand({
      Bucket: this.bucket,
    });

    const res = await this.client.send(command);
    const uploads = res.Uploads || [];

    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    return uploads
      .filter((u) => u.UploadId && u.Key && u.Initiated && u.Initiated < cutoff)
      .map((u) => ({
        uploadId: u.UploadId!,
        key: u.Key!,
        initiated: u.Initiated,
      }));
  }
}
