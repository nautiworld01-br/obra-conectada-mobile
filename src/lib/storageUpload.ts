import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
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
 */
export function extractPathFromSupabaseUrl(url: string | null | undefined): string | null {
  if (!url || !url.includes("/public/")) return null;
  try {
    const parts = url.split("/public/");
    if (parts.length < 2) return null;
    
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

/**
 * Upload universal de arquivo: detecta plataforma e usa o metodo de transporte mais estavel.
 */
export async function uploadLocalFileToStorage({
  bucket,
  filePath,
  fileUri,
  contentType,
  upsert = true,
}: UploadLocalFileParams) {
  if (!supabase) throw new Error("Supabase nao configurado.");

  let fileBody: any;
  const fileType = contentType || inferTypeFromUri(fileUri);

  try {
    if (Platform.OS === "web") {
      // Padrao Web: Fetch gera um Blob que o navegador entende nativamente
      const response = await fetch(fileUri);
      fileBody = await response.blob();
    } else {
      // Padrao Mobile: Le do disco como Base64 e decodifica para ArrayBuffer
      // Usamos a string 'base64' diretamente para evitar erros de constantes undefined em algumas versoes do Expo
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: "base64",
      });
      fileBody = decode(base64);
    }

    const { error } = await supabase.storage.from(bucket).upload(filePath, fileBody, {
      upsert,
      cacheControl: "3600",
      contentType: fileType,
    });

    if (error) {
      console.error("Supabase Storage Error:", error);
      throw error;
    }
  } catch (err) {
    console.error("Erro fatal no upload universal:", err);
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
