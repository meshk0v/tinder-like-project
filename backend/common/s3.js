import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  PutBucketPolicyCommand
} from "@aws-sdk/client-s3";
import { S3 } from "./config.js";

export const s3 = new S3Client({
  endpoint: S3.endpoint,
  region: S3.region,
  forcePathStyle: S3.forcePathStyle,
  credentials: {
    accessKeyId: S3.accessKeyId,
    secretAccessKey: S3.secretAccessKey
  }
});

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3.bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: S3.bucket }));
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${S3.bucket}/*`]
      }
    ]
  };

  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: S3.bucket,
      Policy: JSON.stringify(policy)
    })
  );
}

export async function putObject({ key, body, contentType }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}

export async function deleteObject(key) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: S3.bucket,
      Key: key
    })
  );
}

export function objectUrl(key) {
  return `${S3.publicEndpoint}/${S3.bucket}/${key}`;
}
