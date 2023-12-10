import {BinaryToTextEncoding} from 'crypto';
import {Readable} from 'stream';
import {checksumFromStream} from './checksum-from-stream.js';
import * as errors from './errors.js';
import {ChecksumIsNotAvailable} from './errors.js';
import {PathNormalizer, PathNormalizerV1} from './path-normalizer.js';
import {TextEncoder} from "util";

export type CommonStatInfo = Readonly<{
    path: string,
    lastModifiedMs?: number,
    visibility?: string,
}>;

export type FileInfo = Readonly<{
    type: 'file',
    size?: number,
    isFile: true,
    isDirectory: false,
    mimeType?: string,
} & CommonStatInfo>;

export type DirectoryInfo = Readonly<{
    type: 'directory',
    isFile: false,
    isDirectory: true,
} & CommonStatInfo>;

export function isFile(stat: StatEntry): stat is FileInfo {
    return stat.isFile;
}

export function isDirectory(stat: StatEntry): stat is DirectoryInfo {
    return stat.isDirectory;
}

export type StatEntry = FileInfo | DirectoryInfo;

export interface StorageAdapter {
    write(path: string, contents: Readable, options: WriteOptions): Promise<void>;
    read(path: string): Promise<FileContents>;
    deleteFile(path: string): Promise<void>;
    createDirectory(path: string, options: CreateDirectoryOptions): Promise<void>;
    copyFile(from: string, to: string, options: CopyFileOptions): Promise<void>;
    moveFile(from: string, to: string, options: MoveFileOptions): Promise<void>;
    stat(path: string): Promise<StatEntry>;
    list(path: string, options: {deep: boolean}): AsyncGenerator<StatEntry>;
    changeVisibility(path: string, visibility: string): Promise<void>;
    visibility(path: string): Promise<string>;
    deleteDirectory(path: string): Promise<void>;
    fileExists(path: string): Promise<boolean>;
    directoryExists(path: string): Promise<boolean>;
    publicUrl(path: string, options: PublicUrlOptions): Promise<string>;
    temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string>;
    checksum(path: string, options: ChecksumOptions): Promise<string>;
    mimeType(path: string, options: MimeTypeOptions): Promise<string>;
    lastModified(path: string): Promise<number>;
    fileSize(path: string): Promise<number>;
}

export class DirectoryListing implements AsyncIterable<StatEntry> {
    constructor(
        private readonly listing: AsyncGenerator<StatEntry>,
        private readonly path: string,
        private readonly deep: boolean,
    ) {}
    async toArray(sorted: boolean = true): Promise<StatEntry[]> {
        const items = [];
        for await (const item of this.listing) {
            items.push(item);
        }

        return sorted ? items.sort((a, b) => naturalSorting.compare(a.path, b.path)) : items;
    }
    filter(filter: (entry: StatEntry) => boolean): DirectoryListing {
        const listing = this.listing;
        const filtered = (async function *() {
            for await (const entry of listing) {
                if (filter(entry)) {
                    yield entry;
                }
            }
        })();

        return new DirectoryListing(filtered, this.path, this.deep);
    }
    async *[Symbol.asyncIterator]() {
        try {
            for await (const item of this.listing) {
                yield item;
            }
        } catch (error) {
            throw errors.UnableToListDirectory.because(
                errors.errorToMessage(error),
                {cause: error, context: {path: this.path, deep: this.deep}},
            )
        }
    }
}

export type FileContents = Iterable<any> | AsyncIterable<any> | NodeJS.ReadableStream | Readable | string;

export type MiscellaneousOptions = {
    [option: string]: any,
}

export type MimeTypeOptions = MiscellaneousOptions & {
    disallowFallback?: boolean,
    fallbackMethod?: 'contents' | 'path',
}

export type VisibilityOptions = {
    visibility?: string,
    directoryVisibility?: string,

}
export type WriteOptions = VisibilityOptions & MiscellaneousOptions & {
    mimeType?: string,
    size?: number,
};
export type CreateDirectoryOptions = MiscellaneousOptions & Pick<VisibilityOptions, 'directoryVisibility'> & {};
export type PublicUrlOptions = MiscellaneousOptions & {};
export type CopyFileOptions = MiscellaneousOptions & VisibilityOptions & {
    retainVisibility?: boolean,
};
export type MoveFileOptions = MiscellaneousOptions & VisibilityOptions & {
    retainVisibility?: boolean,
};
export type ListOptions = {deep?: boolean};
export type TemporaryUrlOptions = MiscellaneousOptions & {
    expiresAt: ExpiresAt,
};

export type ChecksumOptions = MiscellaneousOptions & {
    algo?: string,
    encoding?: BinaryToTextEncoding,
}

export type ConfigurationOptions = {
    visibility?: VisibilityOptions,
    writes?: WriteOptions,
    moves?: MoveFileOptions,
    copies?: CopyFileOptions,
    publicUrls?: PublicUrlOptions,
    temporaryUrls?: TemporaryUrlOptions,
    checksums?: ChecksumOptions,
    mimeTypes?: MimeTypeOptions,
}

export function toReadable(contents: FileContents): Readable {
    if (contents instanceof Readable) {
        return contents;
    }

    if (typeof contents === 'string') {
        contents = encoder.encode(contents);
    }

    return Readable.from(contents);
}

const naturalSorting = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base'
});

export class FileStorage {
    constructor(
        private readonly adapter: StorageAdapter,
        private readonly pathNormalizer: PathNormalizer = new PathNormalizerV1(),
        private readonly options: ConfigurationOptions = {},
    ) {
    }

    public async write(path: string, contents: FileContents, options: WriteOptions = {}): Promise<void> {
        try {
            const body = toReadable(contents);
            await this.adapter.write(
                this.pathNormalizer.normalizePath(path),
                body,
                {...this.options.visibility, ...this.options.writes, ...options},
            );
            await closeReadable(body);
        } catch (error) {
            throw errors.UnableToWriteFile.because(
                errors.errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async read(path: string): Promise<Readable> {
        try {
            return Readable.from(await this.adapter.read(this.pathNormalizer.normalizePath(path)));
        } catch (error) {
            throw errors.UnableToReadFile.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async readToString(path: string): Promise<string> {
        return await readableToString(await this.read(path));
    }

    public async readToUint8Array(path: string): Promise<Uint8Array> {
        return await readableToUint8Array(await this.read(path));
    }

    public async readToBuffer(path: string): Promise<Buffer> {
        return Buffer.from(await this.readToUint8Array(path));
    }

    public async deleteFile(path: string): Promise<void> {
        try {
            await this.adapter.deleteFile(this.pathNormalizer.normalizePath(path));
        } catch (error) {
            throw errors.UnableToDeleteFile.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async createDirectory(path: string, options: CreateDirectoryOptions = {}): Promise<void> {
        try {
            return await this.adapter.createDirectory(
                this.pathNormalizer.normalizePath(path),
                {...this.options.visibility, ...options},
            );
        } catch (error) {
            throw errors.UnableToCreateDirectory.because(
                errors.errorToMessage(error),
                {cause: error, context: {path, options}},
            )
        }
    }

    public async deleteDirectory(path: string): Promise<void> {
        try {
            return await this.adapter.deleteDirectory(this.pathNormalizer.normalizePath(path));
        } catch (error) {
            throw errors.UnableToDeleteDirectory.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async stat(path: string): Promise<StatEntry> {
        try {
            return await this.adapter.stat(this.pathNormalizer.normalizePath(path));
        } catch (error) {
            throw errors.UnableToGetStat.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}},
            )
        }
    }

    public async moveFile(from: string, to: string, options: MoveFileOptions = {}): Promise<void> {
        try {
            await this.adapter.moveFile(
                this.pathNormalizer.normalizePath(from),
                this.pathNormalizer.normalizePath(to),
                {...this.options.visibility, ...this.options.moves, ...options},
            );
        } catch (error) {
            throw errors.UnableToMoveFile.because(
                errors.errorToMessage(error),
                {cause: error, context: {from, to}},
            )
        }
    }

    public async copyFile(from: string, to: string, options: CopyFileOptions = {}): Promise<void> {
        try {
            await this.adapter.copyFile(
                this.pathNormalizer.normalizePath(from),
                this.pathNormalizer.normalizePath(to),
                {...this.options.visibility, ...this.options.copies, ...options},
            );
        } catch (error) {
            throw errors.UnableToCopyFile.because(
                errors.errorToMessage(error),
                {cause: error, context: {from, to}},
            )
        }
    }

    public async setVisibility(path: string, visibility: string): Promise<void> {
        try {
            return await this.adapter.changeVisibility(this.pathNormalizer.normalizePath(path), visibility);
        } catch (error) {
            throw errors.UnableToSetVisibility.because(
                errors.errorToMessage(error),
                {cause: error, context: {path, visibility}},
            );
        }
    }

    public async visibility(path: string): Promise<string> {
        try {
            return await this.adapter.visibility(this.pathNormalizer.normalizePath(path));
        } catch (error) {
            throw errors.UnableToGetVisibility.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}}
            )
        }
    }

    public async fileExists(path: string): Promise<boolean> {
        try {
            return await this.adapter.fileExists(this.pathNormalizer.normalizePath(path));
        } catch (error) {
            throw errors.UnableToCheckFileExistence.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}},
            )
        }
    }

    public list(path: string, {deep = false}: ListOptions = {}): DirectoryListing {
        return new DirectoryListing(
            this.adapter.list(this.pathNormalizer.normalizePath(path), {deep}),
            path,
            deep
        );
    }

    public async statFile(path: string): Promise<FileInfo> {
        const stat = await this.stat(path);

        if (isFile(stat)) {
            return stat;
        }

        throw errors.UnableToGetStat.noFileStatResolved({context: {path}});
    }

    public async directoryExists(path: string): Promise<boolean> {
        try {
            return await this.adapter.directoryExists(this.pathNormalizer.normalizePath(path));
        } catch (error) {
            throw errors.UnableToCheckDirectoryExistence.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async publicUrl(path: string, options: PublicUrlOptions = {}): Promise<string> {
        try {
            return await this.adapter.publicUrl(
                this.pathNormalizer.normalizePath(path),
                {...this.options.publicUrls, ...options},
            );
        } catch (error) {
            throw errors.UnableToGetPublicUrl.because(
                errors.errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        try {
            return await this.adapter.temporaryUrl(
                this.pathNormalizer.normalizePath(path),
                {...this.options.temporaryUrls, ...options},
            );
        } catch (error) {
            throw errors.UnableToGetTemporaryUrl.because(
                errors.errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async checksum(path: string, options: ChecksumOptions = {}): Promise<string> {
        try {
            return await this.adapter.checksum(
                this.pathNormalizer.normalizePath(path),
                {...this.options.checksums, ...options},
            );
        } catch (error) {
            if (error instanceof ChecksumIsNotAvailable) {
                return this.calculateChecksum(path, options);
            }

            throw errors.UnableToGetChecksum.because(
                errors.errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async mimeType(path: string, options: MimeTypeOptions = {}): Promise<string> {
        try {
            return await this.adapter.mimeType(
                this.pathNormalizer.normalizePath(path),
                {...this.options.mimeTypes, ...options},
            );
        } catch (error) {
            throw errors.UnableToGetMimeType.because(
                errors.errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async lastModified(path: string): Promise<number> {
        try {
            return await this.adapter.lastModified(
                this.pathNormalizer.normalizePath(path),
            );
        } catch (error) {
            throw errors.UnableToGetLastModified.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async fileSize(path: string): Promise<number> {
        try {
            return await this.adapter.fileSize(
                this.pathNormalizer.normalizePath(path),
            );
        } catch (error) {
            throw errors.UnableToGetFileSize.because(
                errors.errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    private async calculateChecksum(path: string, options: ChecksumOptions): Promise<string> {
        try {
            return await checksumFromStream(await this.read(path), options);
        } catch (error) {
            throw errors.UnableToGetChecksum.because(
                errors.errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }
}

export type TimestampMs = number;
export type ExpiresAt = Date | TimestampMs;

export function normalizeExpiryToDate(expiresAt: ExpiresAt): Date {
    return expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
}
export function normalizeExpiryToMilliseconds(expiresAt: ExpiresAt): number {
    return expiresAt instanceof Date ? expiresAt.getTime() : expiresAt;
}

export async function closeReadable(body: Readable) {
    if (body.closed) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        body.on('close', (err: any) => {
            err ? reject(err) : resolve();
        });
        body.destroy();
    });
}

const decoder = new TextDecoder();

export async function readableToString(stream: Readable): Promise<string> {
    const contents = decoder.decode(await readableToUint8Array(stream));
    await closeReadable(stream);

    return contents;
}

const encoder = new TextEncoder();

export function readableToUint8Array(stream: Readable): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const parts: Uint8Array[] = [];
        stream.on('data', (chunk: Uint8Array | string | number) => {
            const type = typeof chunk;
            if (type === 'string') {
                chunk = encoder.encode(chunk as string);
            } else if (type === 'number') {
                chunk = new Uint8Array([chunk as number]);
            }
            parts.push(chunk as Uint8Array);
        });
        stream.on('error', reject);
        stream.on('end', () => resolve(concatUint8Arrays(parts)));
    });
}

function concatUint8Arrays(input: Uint8Array[]): Uint8Array {
    const length = input.reduce((l, a) => l + (a.byteLength), 0);
    const output = new Uint8Array(length);
    let position = 0;
    input.forEach(i => {
        output.set(i, position);
        position += i.byteLength;
    });

    return output;
}

