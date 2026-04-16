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
 * Realiza o upload de um arquivo local para o storage do Supabase.
 * Usamos FormData para que o React Native envie o arquivo em partes (streaming),
 * evitando erros de memoria e arquivos corrompidos.
 */
export async function uploadLocalFileToStorage({
  bucket,
  filePath,
  fileUri,
  contentType,
  upsert = false,
}: UploadLocalFileParams) {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  const fileName = filePath.split("/").pop() || "file";
  const fileType = contentType || inferTypeFromUri(fileUri);

  // Criamos um FormData, que e a forma nativa do React Native lidar com uploads de arquivos
  const formData = new FormData();
  
  // O 'append' precisa receber esse objeto especial que o RN reconhece como arquivo
  formData.append("file", {
    uri: Platform.OS === "ios" ? fileUri.replace("file://", "") : fileUri,
    name: fileName,
    type: fileType,
  } as any);

  try {
    // No Supabase, quando enviamos FormData, ele extrai o arquivo automaticamente
    const { error } = await supabase.storage.from(bucket).upload(filePath, formData, {
      upsert,
      cacheControl: "3600",
      // Importante: nao definimos o contentType aqui para o FormData usar o boundary correto
    });

    if (error) {
      console.error("--- ERRO NO SUPABASE STORAGE ---");
      console.error("Bucket:", bucket);
      console.error("Path:", filePath);
      console.error("Erro Detalhado:", error);
      throw error;
    }
  } catch (err) {
    console.error("Falha fatal no uploadLocalFileToStorage:", err);
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
  if (ext === "mov") return "video/quicktime";
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
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  const uploadedUrls: string[] = [];

  for (const [index, uri] of uris.entries()) {
    if (!uri?.trim()) continue;

    if (isRemoteAssetUrl(uri)) {
      uploadedUrls.push(uri.trim());
      continue;
    }

    const filePath = `${pathPrefix}/${Date.now()}_${fileBaseName}_${index + 1}`;

    await uploadLocalFileToStorage({
      bucket,
      filePath,
      fileUri: uri,
      contentType,
    });

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    if (data?.publicUrl) {
      uploadedUrls.push(data.publicUrl);
    }
  }

  return uploadedUrls;
}
