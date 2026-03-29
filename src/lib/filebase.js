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
 * Retries up to 6 times with increasing delay (Filebase pins asynchronously).
 */
export async function uploadToFilebase(buffer, key, contentType = 'image/png') {
  const s3 = getClient();

  await s3.send(new PutObjectCommand({
    Bucket: FILEBASE_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  // Filebase populates CID asynchronously — poll HeadObject until it appears
  let cid = null;
  const delays = [500, 1000, 2000, 3000, 5000, 5000]; // ~16.5s total max wait
  for (let attempt = 0; attempt < delays.length; attempt++) {
    await new Promise(r => setTimeout(r, delays[attempt]));
    try {
      const head = await s3.send(new HeadObjectCommand({
        Bucket: FILEBASE_BUCKET,
        Key: key,
      }));
      cid = head.Metadata?.cid || null;
      if (cid) {
        console.log(`[filebase] CID retrieved on attempt ${attempt + 1}: ${cid}`);
        break;
      }
    } catch (err) {
      console.log(`[filebase] HeadObject attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  if (!cid) {
    console.warn(`[filebase] CID not available after ${delays.length} attempts for key: ${key}`);
  }

  // Verify the IPFS gateway URL is actually accessible before returning it
  const gatewayUrl = cid ? `https://ipfs.filebase.io/ipfs/${cid}` : null;
  if (gatewayUrl) {
    try {
      const check = await fetch(gatewayUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      if (!check.ok) {
        console.warn(`[filebase] Gateway verification failed (${check.status}) for ${gatewayUrl} — returning null gateway`);
        return { cid, gateway: null, s3Url: `https://${FILEBASE_BUCKET}.s3.filebase.com/${key}`, key };
      }
    } catch (err) {
      console.warn(`[filebase] Gateway verification timed out for ${gatewayUrl} — returning null gateway`);
      return { cid, gateway: null, s3Url: `https://${FILEBASE_BUCKET}.s3.filebase.com/${key}`, key };
    }
  }

  return {
    cid,
    gateway: gatewayUrl,
    s3Url: `https://${FILEBASE_BUCKET}.s3.filebase.com/${key}`,
    key,
  };
}
