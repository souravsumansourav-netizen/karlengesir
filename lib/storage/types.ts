export interface StoragePart {
  partNumber: number;
  etag: string;
}

export interface PresignedPartUrl {
  partNumber: number;
  url: string;
}

export type CreateUploadResult =
  | {
      mode: "single";
      uploadUrl: string;
      key: string;
    }
  | {
      mode: "multipart";
      uploadId: string;
      key: string;
      partSize: number;
      parts: PresignedPartUrl[];
    };

export interface StaleMultipartUpload {
  uploadId: string;
  key: string;
  initiated?: Date;
}

export interface StorageProvider {
  readonly name: string;

  /**
   * Initialize an upload:
   * Returns a single presigned PUT URL for files <= 100MB,
   * or an S3 Multipart Upload ID with presigned part URLs for larger files.
   */
  createUpload(params: {
    key: string;
    contentType: string;
    sizeBytes: number;
    partSize?: number;
  }): Promise<CreateUploadResult>;

  /**
   * Complete a multipart upload by assembling uploaded parts.
   */
  completeUpload(params: {
    key: string;
    uploadId: string;
    parts: StoragePart[];
  }): Promise<{ location?: string }>;

  /**
   * Abort an unfinished multipart upload and clean up all temporary chunks.
   */
  abortUpload(params: {
    key: string;
    uploadId: string;
  }): Promise<void>;

  /**
   * Generate a secure presigned download GET URL with content-disposition set to attachment.
   */
  getDownloadUrl(params: {
    key: string;
    originalFilename: string;
    expiresInSeconds?: number;
  }): Promise<string>;

  /**
   * Directly upload a buffer/stream from the server to storage (fallback when browser direct upload is blocked).
   */
  uploadDirect?(params: {
    key: string;
    body: Buffer | Uint8Array;
    contentType?: string;
  }): Promise<void>;

  /**
   * Directly upload a multipart chunk from the server to storage (fallback when browser direct part upload is blocked).
   */
  uploadPartDirect?(params: {
    key: string;
    uploadId: string;
    partNumber: number;
    body: Buffer | Uint8Array;
  }): Promise<{ etag: string }>;

  /**
   * Stream an object directly from storage (fallback for downloads when direct B2 is blocked).
   */
  getObjectStream?(params: {
    key: string;
  }): Promise<{ stream: unknown; contentType?: string; contentLength?: number }>;

  /**
   * Permanently delete an object from storage.
   */
  deleteObject(key: string): Promise<void>;

  /**
   * List stale unfinished multipart uploads (e.g. older than 24h) for admin cleanup.
   */
  listStaleMultipartUploads(olderThanHours?: number): Promise<StaleMultipartUpload[]>;
}

