import { uploadLocalFileToStorage } from "./storageUpload";
import { supabase } from "./supabase";

const DEFAULT_BUCKET = "app-media";

export function isRemoteAssetUrl(uri: string | null | undefined) {
  if (!uri) return false;
  const trimmed = uri.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function inferExtension(uri: string) {
  const cleanUri = uri.split("?")[0] ?? uri;
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  return match ? `.${match[1].toLowerCase()}` : "";
}

function inferContentType(uri: string) {
  const extension = inferExtension(uri);
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".m4v":
      return "video/x-m4v";
    case ".3gp":
      return "video/3gpp";
    case ".avi":
      return "video/x-msvideo";
    case ".mpeg":
    case ".mpg":
      return "video/mpeg";
    case ".webm":
      return "video/webm";
    default:
      return null;
  }
}

export async function uploadAppMediaIfNeeded(params: {
  uri: string | null | undefined;
  pathPrefix: string;
  fileBaseName: string;
  contentType?: string | null;
  bucket?: string;
}) {
  let { uri } = params;
  const { pathPrefix, fileBaseName, contentType, bucket } = params;
  if (!uri || !uri.trim()) return null;
  uri = uri.trim();

  if (isRemoteAssetUrl(uri)) return uri.trim();
  if (!supabase) throw new Error("Supabase nao configurado.");

  const inferredType = contentType ?? inferContentType(uri);
  const extension = inferExtension(uri) || (inferredType?.startsWith("video/") ? ".mp4" : ".jpg");
  const filePath = `${pathPrefix}/${Date.now()}_${sanitizeFileName(fileBaseName)}${extension}`;
  const targetBucket = bucket || DEFAULT_BUCKET;

  await uploadLocalFileToStorage({
    bucket: targetBucket,
    filePath,
    fileUri: uri,
    contentType: inferredType,
  });

  const { data } = supabase.storage.from(targetBucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadAppMediaListIfNeeded(params: {
  uris: string[];
  pathPrefix: string;
  fileBaseName: string;
  contentType?: string | null;
  bucket?: string;
}) {
  const results: string[] = [];

  for (const [index, uri] of params.uris.entries()) {
    const uploaded = await uploadAppMediaIfNeeded({
      uri,
      pathPrefix: params.pathPrefix,
      fileBaseName: `${params.fileBaseName}_${index + 1}`,
      contentType: params.contentType,
      bucket: params.bucket,
    });

    if (uploaded) {
      results.push(uploaded);
    }
  }

  return results;
}
