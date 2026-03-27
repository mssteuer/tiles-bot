import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

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
 * Upload image to Filebase (S3-compatible, auto-pins to IPFS).
 * After upload, HEAD the object to retrieve the IPFS CID from metadata.
 */
export async function uploadToFilebase(buffer, key, contentType = 'image/png') {
  const s3 = getClient();

  await s3.send(new PutObjectCommand({
    Bucket: FILEBASE_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  // Filebase populates CID asynchronously — HEAD to retrieve it
  let cid = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const head = await s3.send(new HeadObjectCommand({
        Bucket: FILEBASE_BUCKET,
        Key: key,
      }));
      cid = head.Metadata?.cid || null;
      if (cid) break;
    } catch {
      // ignore, retry
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
  }

  return {
    cid,
    gateway: cid ? `https://ipfs.filebase.io/ipfs/${cid}` : null,
    s3Url: `https://${FILEBASE_BUCKET}.s3.filebase.com/${key}`,
    key,
  };
}
