import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

let client: S3Client | null = null;

export function isR2Configured(): boolean {
  const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = config.r2;
  return Boolean(accountId && accessKeyId && secretAccessKey && bucketName && publicUrl);
}

function getClient(): S3Client {
  if (!client) {
    const { accountId, accessKeyId, secretAccessKey } = config.r2;
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }
  return client;
}

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const { bucketName, publicUrl } = config.r2;
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const base = publicUrl!.replace(/\/$/, "");
  return `${base}/${key}`;
}
