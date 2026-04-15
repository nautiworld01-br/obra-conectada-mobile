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

  const arrayBuffer = await readArrayBufferFromLocalUri(fileUri);

  const { error } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, {
    contentType: contentType ?? undefined,
    upsert,
  });

  if (error) {
    throw error;
  }
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
