import { Media } from "@capacitor-community/media";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// Copies a capture into the phone's own photo gallery, in an album of our own.
// Only works inside the Android app — in a browser there is no gallery to write
// to, and the download button stays the way out.

const ALBUM_NAME = "Zeitstempel-Kamera";

/** Base64 chunk size. A multiple of 3 keeps every chunk self-contained. */
const CHUNK_BYTES = 3 * 256 * 1024;

export function canSaveToGallery(): boolean {
  return Capacitor.isNativePlatform();
}

function blobToBase64(blob: Blob, withPrefix: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(withPrefix ? result : result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

let albumIdentifier: string | null = null;

/** Finds our album, creating it on first use. Cached for the session. */
async function ensureAlbum(): Promise<string> {
  if (albumIdentifier) return albumIdentifier;

  // On Android an album identifier is its path, and several albums may share a
  // name — so only ours, below the albums root, counts as a match.
  let albumsPathPrefix = "";
  try {
    albumsPathPrefix = (await Media.getAlbumsPath()).path;
  } catch {
    /* iOS or older plugin — fall back to matching on the name alone */
  }

  const findExisting = async () => {
    const { albums } = await Media.getAlbums();
    const match = albums.find(
      (album) =>
        album.name === ALBUM_NAME &&
        (!albumsPathPrefix || album.identifier.startsWith(albumsPathPrefix))
    );
    return match?.identifier;
  };

  let identifier = await findExisting();
  if (!identifier) {
    await Media.createAlbum({ name: ALBUM_NAME });
    identifier = await findExisting();
  }
  if (!identifier) throw new Error(`Album "${ALBUM_NAME}" konnte nicht angelegt werden.`);

  albumIdentifier = identifier;
  return identifier;
}

/**
 * Writes a blob into the app cache in chunks and returns its file URI. Videos can
 * be tens of megabytes; turning one into a single base64 string would blow up
 * memory, so it goes across in slices.
 */
async function writeToCache(blob: Blob, name: string): Promise<string> {
  let offset = 0;
  let first = true;

  while (offset < blob.size) {
    const data = await blobToBase64(blob.slice(offset, offset + CHUNK_BYTES), false);
    if (first) {
      await Filesystem.writeFile({ path: name, directory: Directory.Cache, data, recursive: true });
      first = false;
    } else {
      await Filesystem.appendFile({ path: name, directory: Directory.Cache, data });
    }
    offset += CHUNK_BYTES;
  }

  const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: name });
  return uri;
}

async function removeFromCache(name: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: name, directory: Directory.Cache });
  } catch {
    /* the OS clears its cache directory on its own */
  }
}

/**
 * Opens the Android share sheet for a capture. The web share API does not exist
 * inside the WebView, so the file goes through the cache and the native Share
 * plugin. The cache copy stays until the OS clears it — deleting right away
 * would pull the file out from under the receiving app.
 */
export async function shareCapture(blob: Blob, filename: string): Promise<void> {
  if (!canSaveToGallery()) throw new Error("Teilen gibt es nur in der Android-App.");
  const uri = await writeToCache(blob, `share-${filename}`);
  try {
    await Share.share({ title: filename, files: [uri] });
  } catch (err) {
    // Dismissing the share sheet rejects too — that is not an error.
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) return;
    throw err;
  }
}

/**
 * Saves a capture to the phone gallery. Throws with a readable message so the
 * caller can surface it — the capture itself is already safe in the app either
 * way.
 */
export async function saveToGallery(
  blob: Blob,
  filename: string,
  kind: "photo" | "video"
): Promise<void> {
  if (!canSaveToGallery()) throw new Error("Die Galerie gibt es nur in der Android-App.");

  const albumId = await ensureAlbum();
  const baseName = filename.replace(/\.[^.]+$/, ""); // the plugin adds the extension

  if (kind === "photo") {
    // Photos are a few megabytes at most, so the direct route is fine.
    await Media.savePhoto({
      path: await blobToBase64(blob, true),
      albumIdentifier: albumId,
      fileName: baseName,
    });
    return;
  }

  const cacheName = `gallery-${filename}`;
  const uri = await writeToCache(blob, cacheName);
  try {
    await Media.saveVideo({ path: uri, albumIdentifier: albumId, fileName: baseName });
  } catch (err) {
    // Some plugin versions want a bare filesystem path rather than a file:// URI.
    const bare = uri.replace(/^file:\/\//, "");
    if (bare === uri) throw err;
    await Media.saveVideo({ path: bare, albumIdentifier: albumId, fileName: baseName });
  } finally {
    await removeFromCache(cacheName);
  }
}
