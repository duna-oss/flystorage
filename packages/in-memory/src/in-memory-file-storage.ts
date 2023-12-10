import {
    ChecksumIsNotAvailable,
    ChecksumOptions,
    CopyFileOptions,
    CreateDirectoryOptions,
    FileContents,
    MimeTypeOptions,
    MoveFileOptions,
    PublicUrlOptions,
    StatEntry,
    StorageAdapter,
    TemporaryUrlOptions,
    VisibilityOptions,
    WriteOptions,
    readableToUint8Array,
} from "@flystorage/file-storage";
import {Readable} from "node:stream";
import {dirname, parse} from 'node:path'
import {lookup as mimeTimeForExt} from "mime-types";

type FileEntry = {
    type: 'file',
    path: string,
    contents: Uint8Array,
    lastModifiedMs: number,
    visibility?: string,
}

type DirectoryEntry = {
    type: 'directory',
    path: string,
    visibility?: string,
}

export type TimestampResolver = () => number;

export class InMemoryFileStorage implements StorageAdapter {
    private entries: Map<string, FileEntry | DirectoryEntry> = new Map;

    constructor(
        private readonly timestampResolver: TimestampResolver = () => Date.now(),
    ) {
    }

    deleteEverything(): void {
        this.entries = new Map;
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        this.ensureParentDirsExist(path, options);

        this.entries.set(path, {
            type: 'file',
            path,
            contents: new Uint8Array(await readableToUint8Array(contents)),
            lastModifiedMs: this.timestampResolver(),
            visibility: options.visibility,
        })
    }

    private ensureParentDirsExist(path: string, options: VisibilityOptions) {
        let parentDir = dirname(path);

        while (!['.', ''].includes(parentDir) && !this.entries.has(parentDir)) {
            this.entries.set(parentDir, {
                path: parentDir,
                type: 'directory',
                visibility: options.directoryVisibility,
            });

            parentDir = dirname(parentDir);
        }
    }

    async read(path: string): Promise<FileContents> {
        const file = this.entries.get(path);

        if (file?.type !== 'file') {
            throw new Error(`Path "${path}" is not a file`);
        }

        return file.contents;
    }
    async deleteFile(path: string): Promise<void> {
        this.entries.delete(path);
    }
    async createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        path = path.replace(/\/+$/g, '');

        this.entries.set(path, {
            path,
            type: 'directory',
            visibility: options.directoryVisibility,
        });
    }
    async copyFile(from: string, to: string, options: CopyFileOptions): Promise<void> {
        const source = this.entries.get(from);

        if (source?.type !== 'file') {
            throw new Error(`Source file ${from} does not exist`);
        }

        this.ensureParentDirsExist(to, options);
        this.entries.set(to, {
            ...source,
            path: to,
        });
    }
    async moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        await this.copyFile(from, to, options);
        await this.deleteFile(from);
    }
    async stat(path: string): Promise<StatEntry> {
        const entry = this.entries.get(path);

        if (entry === undefined) {
            throw new Error(`No entry found for path "${path}"`);
        }

        return this.mapToStatEntry(entry);
    }
    private mapToStatEntry(entry: DirectoryEntry | FileEntry): StatEntry {
        if (entry.type === 'directory') {
            return {
                ...entry,
                isDirectory: true,
                isFile: false,
            };
        }

        return {
            type: 'file',
            path: entry.path,
            visibility: entry.visibility,
            isFile: true,
            isDirectory: false,
            lastModifiedMs: entry.lastModifiedMs,
        }
    }
    async *list(path: string, options: { deep: boolean; }): AsyncGenerator<StatEntry, any, unknown> {
        const entries = this.entries.values();
        const prefix = `${path.replace(/\/+$/g, '')}/`;

        for (const entry of entries) {
            if (!entry.path.startsWith(prefix)) {
                continue;
            }

            if (options.deep !== true && entry.path.indexOf('/', prefix.length) !== -1) {
                continue;
            }

            yield this.mapToStatEntry(entry);
        }
    }
    async changeVisibility(path: string, visibility: string): Promise<void> {
        const entry = this.entries.get(path);

        if (entry?.type !== 'file') {
            throw new Error(`Path ${path} is not a file`);
        }

        this.entries.set(path, {
            ...entry,
            visibility,
        });
    }
    async visibility(path: string): Promise<string> {
        const entry = this.entries.get(path);

        if (entry === undefined) {
            throw new Error(`Path ${path} does not exist`);
        }

        return entry.visibility ?? 'public';
    }
    async deleteDirectory(path: string): Promise<void> {
        const entries = this.entries.values();
        const prefix = `${path.replace(/\/+$/g, '')}/`;

        for (const entry of entries) {
            if (entry.path.startsWith(prefix) || entry.path === path) {
                this.entries.delete(entry.path);
            }
        }
    }
    async fileExists(path: string): Promise<boolean> {
        return this.entries.get(path)?.type === 'file';
    }
    async directoryExists(path: string): Promise<boolean> {
        return this.entries.get(path)?.type === 'directory';
    }
    async publicUrl(path: string, options: PublicUrlOptions): Promise<string> {
        throw new Error("Method not implemented.");
    }
    async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        throw new Error("Method not implemented.");
    }
    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        if (!(this.entries.get(path)?.type === 'file')) {
            throw new Error(`File ${path} does not exists`);
        }

        throw ChecksumIsNotAvailable.checksumNotSupported(options.algo ?? 'unknown', {
            context: {path},
        });
    }
    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        const entry = this.entries.get(path);

        if (entry?.type !== 'file') {
            throw new Error(`File ${path} does not exist`);
        }

        return await resolveMimeType(path, entry.contents);
    }
    async lastModified(path: string): Promise<number> {
        const entry = this.entries.get(path);

        if (entry?.type !== 'file') {
            throw new Error(`File ${path} does not exist`);
        }

        return entry.lastModifiedMs;
    }
    async fileSize(path: string): Promise<number> {
        const entry = this.entries.get(path);

        if (entry?.type !== 'file') {
            throw new Error(`File ${path} does not exist`);
        }

        return entry.contents.byteLength;
    }
}

export async function resolveMimeType(
    filename: string,
    contents: Uint8Array,
): Promise<string> {
    const {fileTypeFromBuffer} = await import('file-type');
    const lookup = await fileTypeFromBuffer(contents);

    if (lookup) {
        return lookup.mime;
    }

    const {ext} = parse(filename);

    return mimeTimeForExt(ext) || 'application/octet-stream';
}