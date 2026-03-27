import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const FILEBASE_KEY = process.env.FILEBASE_KEY;
const FILEBASE_SECRET = process.env.FILEBASE_SECRET;
const FILEBASE_BUCKET = process.env.FILEBASE_BUCKET || 'tiles-bot';

let client = null;

export function isFilebaseConfigured() {
  return !!(FILEBASE_KEY && FILEBASE_SECRET);
}

function getClient() {
  if (!client) {
    client = new S3Client({
      endpoint: 'https://s3.filebase.com',
      region: 'us-east-1',
      credentials: {
        accessKeyId: FILEBASE_KEY,
        secretAccessKey: FILEBASE_SECRET,
      },
    });
  }
  return client;
}

/**
 * Upload image to Filebase (S3-compatible, pins to IPFS automatically).
 * Returns the IPFS CID from the response headers.
 */
export async function uploadToFilebase(buffer, key, contentType = 'image/png') {
  const s3 = getClient();

  const cmd = new PutObjectCommand({
    Bucket: FILEBASE_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  const response = await s3.send(cmd);

  // Filebase returns the IPFS CID in x-amz-meta-cid header
  const cid = response.$metadata?.httpHeaders?.['x-amz-meta-cid']
    || response.VersionId; // fallback — some SDK versions expose it differently

  return {
    cid,
    gateway: cid ? `https://ipfs.filebase.io/ipfs/${cid}` : null,
    s3Url: `https://${FILEBASE_BUCKET}.s3.filebase.com/${key}`,
    key,
  };
}

/**
 * Get the CID for an existing object.
 */
export async function getCid(key) {
  const s3 = getClient();
  try {
    const cmd = new GetObjectCommand({
      Bucket: FILEBASE_BUCKET,
      Key: key,
    });
    const response = await s3.send(cmd);
    return response.Metadata?.cid || null;
  } catch {
    return null;
  }
}
