import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { createInflateRaw, type InflateRaw } from "node:zlib";

import {
  Unzip,
  Zip,
  ZipPassThrough,
  unzip,
  type AsyncFlateStreamHandler,
  type FlateError,
  type UnzipFile,
} from "fflate";

const mebibyte = 1_024 * 1_024;
const archiveChunkBytes = 64 * 1_024;

export const defaultDatasetArchiveLimits: DatasetArchiveLimits = {
  maxArchiveBytes: 264 * mebibyte,
  maxEntryCount: 10_002,
  maxExpandedBytes: 256 * mebibyte,
};

export type DatasetArchiveLimits = Readonly<{
  maxArchiveBytes: number;
  maxEntryCount: number;
  maxExpandedBytes: number;
}>;

export type DatasetArchiveEntries = ReadonlyMap<string, Uint8Array>;

export async function encodeDatasetArchive(
  entries: DatasetArchiveEntries,
  limits: DatasetArchiveLimits,
): Promise<Uint8Array> {
  checkEntryBounds(entries, limits);
  return storeArchive(entries, limits);
}

export async function readDatasetArchive(
  archivePath: string,
  limits: DatasetArchiveLimits,
): Promise<DatasetArchiveEntries> {
  const archiveFile = await stat(archivePath);
  if (!archiveFile.isFile() || archiveFile.size > limits.maxArchiveBytes) {
    throw new Error("The backup archive is larger than the supported size");
  }
  const archiveBytes = await readFile(archivePath);
  if (archiveBytes.byteLength > limits.maxArchiveBytes) {
    throw new Error("The backup archive is larger than the supported size");
  }
  await preflightArchive(archiveBytes, limits);
  return expandArchive(archiveBytes, limits);
}

function checkEntryBounds(entries: DatasetArchiveEntries, limits: DatasetArchiveLimits): void {
  if (entries.size > limits.maxEntryCount) {
    throw new Error("The backup archive contains too many files");
  }
  let expandedBytes = 0;
  for (const bytes of entries.values()) {
    expandedBytes += bytes.byteLength;
    if (expandedBytes > limits.maxExpandedBytes) {
      throw new Error("The backup archive expands beyond the supported size");
    }
  }
}

function storeArchive(
  entries: DatasetArchiveEntries,
  limits: DatasetArchiveLimits,
): Promise<Uint8Array> {
  return new Promise((resolveArchive, rejectArchive) => {
    const chunks: Uint8Array[] = [];
    let archiveBytes = 0;
    let settled = false;
    const zipper = new Zip((error, chunk, final) => {
      if (settled) return;
      if (error) {
        settled = true;
        rejectArchive(error);
        return;
      }
      archiveBytes += chunk.byteLength;
      if (archiveBytes > limits.maxArchiveBytes) {
        settled = true;
        zipper.terminate();
        rejectArchive(new Error("The backup archive is larger than the supported size"));
        return;
      }
      chunks.push(chunk);
      if (final) {
        settled = true;
        resolveArchive(joinChunks(chunks, archiveBytes));
      }
    });

    try {
      for (const [path, bytes] of entries) {
        const file = new ZipPassThrough(path);
        zipper.add(file);
        pushChunks(file, bytes);
      }
      zipper.end();
    } catch (error) {
      settled = true;
      zipper.terminate();
      rejectArchive(error);
    }
  });
}

function pushChunks(file: ZipPassThrough, bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    file.push(bytes, true);
    return;
  }
  for (let offset = 0; offset < bytes.byteLength; offset += archiveChunkBytes) {
    const end = Math.min(offset + archiveChunkBytes, bytes.byteLength);
    file.push(bytes.subarray(offset, end), end === bytes.byteLength);
  }
}

function preflightArchive(archiveBytes: Uint8Array, limits: DatasetArchiveLimits): Promise<void> {
  return new Promise((resolvePreflight, rejectPreflight) => {
    const paths = new Set<string>();
    let expandedBytes = 0;
    let entryCount = 0;
    try {
      unzip(
        archiveBytes,
        {
          filter: (entry) => {
            entryCount += 1;
            if (entryCount > limits.maxEntryCount) {
              throw new Error("The backup archive contains too many files");
            }
            checkArchivePath(entry.name);
            if (paths.has(entry.name)) {
              throw new Error("The backup archive contains duplicate paths");
            }
            paths.add(entry.name);
            expandedBytes += entry.originalSize;
            if (expandedBytes > limits.maxExpandedBytes) {
              throw new Error("The backup archive expands beyond the supported size");
            }
            return false;
          },
        },
        (error) => {
          if (error) rejectPreflight(error);
          else resolvePreflight();
        },
      );
    } catch (error) {
      rejectPreflight(error);
    }
  });
}

function expandArchive(
  archiveBytes: Uint8Array,
  limits: DatasetArchiveLimits,
): Promise<DatasetArchiveEntries> {
  return new Promise((resolveArchive, rejectArchive) => {
    const entries = new Map<string, Uint8Array>();
    const paths = new Set<string>();
    const pendingFiles: UnzipFile[] = [];
    let activeFile: UnzipFile | null = null;
    let expandedBytes = 0;
    let foundEntries = 0;
    let inputComplete = false;
    let settled = false;

    const reject = (error: Error): void => {
      if (settled) return;
      settled = true;
      activeFile?.terminate();
      rejectArchive(error);
    };
    const finishIfComplete = (): void => {
      if (!settled && inputComplete && activeFile === null && pendingFiles.length === 0) {
        settled = true;
        resolveArchive(entries);
      }
    };
    const startNextFile = (): void => {
      if (settled || activeFile) return;
      const file = pendingFiles.shift();
      if (!file) {
        finishIfComplete();
        return;
      }
      activeFile = file;
      const chunks: Uint8Array[] = [];
      let entryBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (settled) return;
        if (error) {
          reject(error);
          return;
        }
        entryBytes += chunk.byteLength;
        expandedBytes += chunk.byteLength;
        if (expandedBytes > limits.maxExpandedBytes) {
          file.terminate();
          reject(new Error("The backup archive expands beyond the supported size"));
          return;
        }
        chunks.push(chunk);
        if (final) {
          entries.set(file.name, joinChunks(chunks, entryBytes));
          activeFile = null;
          queueMicrotask(startNextFile);
        }
      };
      try {
        file.start();
      } catch (error) {
        reject(error instanceof Error ? error : new Error("The backup archive could not be read"));
      }
    };

    const unzipper = new Unzip((file) => {
      if (settled) return;
      foundEntries += 1;
      if (foundEntries > limits.maxEntryCount) {
        reject(new Error("The backup archive contains too many files"));
        return;
      }
      try {
        checkArchivePath(file.name);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("The backup archive could not be read"));
        return;
      }
      if (paths.has(file.name)) {
        reject(new Error("The backup archive contains duplicate paths"));
        return;
      }
      paths.add(file.name);
      pendingFiles.push(file);
      startNextFile();
    });
    unzipper.register(BoundedUnzipInflate);

    try {
      for (let offset = 0; offset < archiveBytes.byteLength; offset += archiveChunkBytes) {
        const end = Math.min(offset + archiveChunkBytes, archiveBytes.byteLength);
        unzipper.push(archiveBytes.subarray(offset, end), end === archiveBytes.byteLength);
      }
      inputComplete = true;
      finishIfComplete();
    } catch (error) {
      reject(error instanceof Error ? error : new Error("The backup archive could not be read"));
    }
  });
}

function checkArchivePath(path: string): void {
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..") ||
    basename(path) === ""
  ) {
    throw new Error("The backup archive contains an unsafe path");
  }
}

class BoundedUnzipInflate {
  static readonly compression = 8;

  ondata: AsyncFlateStreamHandler = () => undefined;
  private readonly inflater: InflateRaw;
  private final = false;

  constructor() {
    this.inflater = createInflateRaw({ chunkSize: archiveChunkBytes });
    this.inflater.on("data", (chunk: Buffer) => this.ondata(null, Uint8Array.from(chunk), false));
    this.inflater.on("end", () => this.ondata(null, new Uint8Array(), true));
    this.inflater.on("error", (error) => {
      const inflateError: FlateError = Object.assign(new Error(error.message), { code: 13 });
      this.ondata(inflateError, new Uint8Array(), this.final);
    });
  }

  push(chunk: Uint8Array, final: boolean): void {
    if (final) {
      this.final = true;
      this.inflater.end(chunk);
      return;
    }
    this.inflater.write(chunk);
  }

  terminate(): void {
    this.inflater.destroy();
  }
}

function joinChunks(chunks: readonly Uint8Array[], byteLength: number): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}
