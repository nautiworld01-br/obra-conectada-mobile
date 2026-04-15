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

  const arrayBuffer = await readArrayBufferFromLocalUri(fileUri);

  const { error } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, {
    contentType: contentType ?? undefined,
    upsert,
  });

  if (error) {
    throw error;
  }
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

function readArrayBufferFromLocalUri(fileUri: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const blob = xhr.response as Blob;
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Nao foi possivel converter o arquivo para upload."));
      reader.readAsArrayBuffer(blob);
    };
    xhr.onerror = () => reject(new Error("Nao foi possivel ler o arquivo local para upload."));
    xhr.responseType = "blob";
    xhr.open("GET", fileUri, true);
    xhr.send();
  });
}
