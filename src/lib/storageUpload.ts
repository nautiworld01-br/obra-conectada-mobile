import { supabase } from "./supabase";

type UploadLocalFileParams = {
  bucket: string;
  filePath: string;
  fileUri: string;
  contentType?: string | null;
  upsert?: boolean;
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

  const blob = await readBlobFromLocalUri(fileUri);

  const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
    contentType: contentType ?? undefined,
    upsert,
  });

  if (error) {
    throw error;
  }
}

function readBlobFromLocalUri(fileUri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error("Nao foi possivel ler o arquivo local para upload."));
    xhr.responseType = "blob";
    xhr.open("GET", fileUri, true);
    xhr.send();
  });
}
