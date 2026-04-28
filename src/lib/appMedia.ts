import { uploadLocalFileToStorage, UploadProgress } from "./storageUpload";
import { supabase } from "./supabase";
import { extractPathFromSupabaseUrl } from "./storageUpload";

// Configurações padrão para o armazenamento de mídia do aplicativo.
const DEFAULT_BUCKET = "app-media";
const DEFAULT_UPLOAD_CONCURRENCY = 2;

export type AppMediaUploadProgress = {
  progress: number;
  message: string;
  completedItems: number;
  totalItems: number;
  currentItem?: number;
  currentItemLabel?: string;
};

export function getOptimizedStorageImageUrl(params: {
  url: string | null | undefined;
  bucket: string;
  width: number;
  height?: number;
  quality?: number;
}) {
  const { url, bucket, width, height, quality = 65 } = params;

  if (!url || !supabase || !isRemoteAssetUrl(url)) {
    return url ?? "";
  }

  const filePath = extractPathFromSupabaseUrl(url);
  if (!filePath) {
    return url;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath, {
    transform: {
      width,
      ...(height ? { height } : {}),
      quality,
      resize: "contain",
    },
  });

  return data.publicUrl || url;
}

// Verifica se uma URI já é um link remoto (http/https).
export function isRemoteAssetUrl(uri: string | null | undefined) {
  if (!uri) return false;
  const trimmed = uri.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

// Remove caracteres especiais de nomes de arquivos para evitar erros no Storage.
function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Extrai a extensão do arquivo a partir de sua URI ou caminho.
function inferExtension(uri: string) {
  const cleanUri = uri.split("?")[0] ?? uri;
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  return match ? `.${match[1].toLowerCase()}` : "";
}

// Mapeia extensões comuns para seus respectivos tipos MIME de mídia.
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

// Gerencia o upload de um arquivo local para o Supabase Storage se ele ainda não for remoto.
// Retorna a URL pública do arquivo após o upload bem-sucedido.
export async function uploadAppMediaIfNeeded(params: {
  uri: string | null | undefined;
  pathPrefix: string;
  fileBaseName: string;
  contentType?: string | null;
  bucket?: string;
  onProgress?: (progress: UploadProgress) => void;
}) {
  let { uri } = params;
  const { pathPrefix, fileBaseName, contentType, bucket, onProgress } = params;
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
    onProgress,
  });

  const { data } = supabase.storage.from(targetBucket).getPublicUrl(filePath);
  return data.publicUrl;
}

// Processa uma lista de URIs, realizando o upload de cada uma que for local.
export async function uploadAppMediaListIfNeeded(params: {
  uris: string[];
  pathPrefix: string;
  fileBaseName: string;
  contentType?: string | null;
  bucket?: string;
  concurrency?: number;
  onProgress?: (progress: AppMediaUploadProgress) => void;
}) {
  const totalItems = params.uris.length;
  const progressByItem = new Map<number, number>();
  const resultsByIndex = new Map<number, string>();
  const concurrency = Math.max(1, Math.min(params.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY, totalItems || 1));

  const emitProgress = (overrides: {
    itemNumber: number;
    itemLabel: string;
    message: string;
  }) => {
    const completedItems = Array.from(progressByItem.values()).filter((value) => value >= 100).length;
    const aggregateProgress =
      totalItems === 0
        ? 100
        : Array.from({ length: totalItems }).reduce<number>((sum, _, index) => sum + (progressByItem.get(index) ?? 0), 0) / totalItems;

    params.onProgress?.({
      progress: aggregateProgress,
      message: overrides.message,
      completedItems,
      totalItems,
      currentItem: overrides.itemNumber,
      currentItemLabel: overrides.itemLabel,
    });
  };

  if (!totalItems) {
    params.onProgress?.({
      progress: 100,
      message: "Nenhum arquivo para enviar.",
      completedItems: 0,
      totalItems: 0,
      currentItem: 0,
      currentItemLabel: undefined,
    });
    return [];
  }

  const uploadSingleItem = async (index: number) => {
    const uri = params.uris[index];
    const itemNumber = index + 1;
    const itemLabel = `${params.fileBaseName} ${itemNumber}`;
    progressByItem.set(index, 0);

    if (isRemoteAssetUrl(uri)) {
      resultsByIndex.set(index, uri.trim());
      progressByItem.set(index, 100);
      emitProgress({
        itemNumber,
        itemLabel,
        message: `${itemLabel} já estava enviado.`,
      });
      return;
    }

    emitProgress({
      itemNumber,
      itemLabel,
      message: `Preparando ${itemLabel} na fila...`,
    });

    const uploaded = await uploadAppMediaIfNeeded({
      uri,
      pathPrefix: params.pathPrefix,
      fileBaseName: `${params.fileBaseName}_${itemNumber}`,
      contentType: params.contentType,
      bucket: params.bucket,
      onProgress: ({ progress, message }) => {
        progressByItem.set(index, progress);
        emitProgress({
          itemNumber,
          itemLabel,
          message: `${itemLabel}: ${message}`,
        });
      },
    });

    progressByItem.set(index, 100);
    if (uploaded) {
      resultsByIndex.set(index, uploaded);
    }

    emitProgress({
      itemNumber,
      itemLabel,
      message: `${itemLabel} concluído.`,
    });
  };

  let nextIndex = 0;

  const workers = Array.from({ length: concurrency }).map(async () => {
    while (nextIndex < totalItems) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      await uploadSingleItem(currentIndex);
    }
  });

  await Promise.all(workers);

  return params.uris.reduce<string[]>((acc, _, index) => {
    const uploaded = resultsByIndex.get(index);
    if (uploaded) {
      acc.push(uploaded);
    }
    return acc;
  }, []);
}
