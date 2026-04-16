import { Platform } from "react-native";
import { supabase } from "./supabase";

type UploadLocalFileParams = {
  bucket: string;
  filePath: string;
  fileUri: string;
  contentType?: string | null;
  upsert?: boolean;
};

type UploadLocalFilesToPublicUrlsParams = {
  bucket: string;
  pathPrefix: string;
  uris: string[];
  fileBaseName: string;
  contentType?: string | null;
};

/**
 * Extrai o path do arquivo de uma URL publica do Supabase.
 * Ex: https://xxx.supabase.co/storage/v1/object/public/bucket/pasta/foto.jpg -> pasta/foto.jpg
 */
export function extractPathFromSupabaseUrl(url: string | null | undefined): string | null {
  if (!url || !url.includes("/public/")) return null;
  try {
    const parts = url.split("/public/");
    if (parts.length < 2) return null;
    
    // Pega tudo após o nome do bucket
    const pathWithBucket = parts[1];
    const firstSlashIndex = pathWithBucket.indexOf("/");
    if (firstSlashIndex === -1) return null;
    
    return pathWithBucket.substring(firstSlashIndex + 1);
  } catch {
    return null;
  }
}

/**
 * Remove um arquivo fisicamente do Storage.
 * future_fix: Adicionar log de erro se a delecao falhar mas o registro no banco continuar.
 */
export async function deleteFileFromStorage(bucket: string, url: string | null | undefined) {
  if (!supabase || !url) return;
  const path = extractPathFromSupabaseUrl(url);
  if (!path) return;

  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch (err) {
    console.error("Falha ao limpar arquivo antigo do storage:", err);
  }
}

export async function uploadLocalFileToStorage({
  bucket,
  filePath,
  fileUri,
  contentType,
  upsert = true, // Padrao sênior: upsert true evita erros 400 de conflito
}: UploadLocalFileParams) {
  if (!supabase) throw new Error("Supabase nao configurado.");

  // Padrao universal: converte URI em Blob (funciona em Web, iOS e Android)
  const response = await fetch(fileUri);
  const blob = await response.blob();
  
  const fileType = contentType || inferTypeFromUri(fileUri);

  try {
    const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
      upsert,
      cacheControl: "3600",
      contentType: fileType, // Essencial para navegadores
    });

    if (error) {
      console.error("Supabase Storage Error:", error);
      throw error;
    }
  } catch (err) {
    throw err;
  }
}

function inferTypeFromUri(uri: string) {
  const cleanUri = uri.split("?")[0];
  const ext = cleanUri.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "mp4") return "video/mp4";
  return "application/octet-stream";
}

export function isRemoteAssetUrl(uri: string | null | undefined) {
  if (!uri) return false;
  return uri.startsWith("http://") || uri.startsWith("https://");
}

export async function uploadLocalFilesToPublicUrls({
  bucket,
  pathPrefix,
  uris,
  fileBaseName,
  contentType,
}: UploadLocalFilesToPublicUrlsParams) {
  if (!supabase) throw new Error("Supabase nao configurado.");
  const uploadedUrls: string[] = [];

  for (const [index, uri] of uris.entries()) {
    if (!uri?.trim()) continue;
    if (isRemoteAssetUrl(uri)) {
      uploadedUrls.push(uri.trim());
      continue;
    }

    const filePath = `${pathPrefix}/${Date.now()}_${fileBaseName}_${index + 1}`;
    await uploadLocalFileToStorage({ bucket, filePath, fileUri: uri, contentType });
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    if (data?.publicUrl) uploadedUrls.push(data.publicUrl);
  }
  return uploadedUrls;
}
