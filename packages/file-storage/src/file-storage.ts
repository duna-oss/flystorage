import {BinaryToTextEncoding} from 'crypto';
import {Readable} from 'stream';
import {checksumFromStream} from './checksum-from-stream.js';
import {PathNormalizer, PathNormalizerV1} from './path-normalizer.js';
import {TextEncoder} from 'util';
import {
    ChecksumIsNotAvailable,
    errorToMessage,
    isFileWasNotFound,
    UnableToCheckDirectoryExistence,
    UnableToCheckFileExistence,
    UnableToCopyFile,
    UnableToCreateDirectory,
    UnableToDeleteDirectory,
    UnableToDeleteFile,
    UnableToGetChecksum,
    UnableToGetFileSize,
    UnableToGetLastModified,
    UnableToGetMimeType,
    UnableToGetPublicUrl,
    UnableToGetStat,
    UnableToGetTemporaryUrl,
    UnableToGetVisibility,
    UnableToListDirectory,
    UnableToMoveFile,
    UnableToPrepareUploadRequest,
    UnableToReadFile,
    UnableToSetVisibility,
    UnableToWriteFile,
} from './errors.js';
import {PassThrough} from 'node:stream';

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

export type AdapterListOptions = ListOptions & { deep: boolean };

export interface StorageAdapter {
    write(path: string, contents: Readable, options: WriteOptions): Promise<void>;

    read(path: string, options: MiscellaneousOptions): Promise<FileContents>;

    deleteFile(path: string, options: MiscellaneousOptions): Promise<void>;

    createDirectory(path: string, options: CreateDirectoryOptions): Promise<void>;

    copyFile(from: string, to: string, options: CopyFileOptions): Promise<void>;

    moveFile(from: string, to: string, options: MoveFileOptions): Promise<void>;

    stat(path: string, options: MiscellaneousOptions): Promise<StatEntry>;

    list(path: string, options: AdapterListOptions): AsyncGenerator<StatEntry>;

    changeVisibility(path: string, visibility: string, options: MiscellaneousOptions): Promise<void>;

    visibility(path: string, options: MiscellaneousOptions): Promise<string>;

    deleteDirectory(path: string, options: MiscellaneousOptions): Promise<void>;

    fileExists(path: string, options: MiscellaneousOptions): Promise<boolean>;

    directoryExists(path: string, options: MiscellaneousOptions): Promise<boolean>;

    publicUrl(path: string, options: PublicUrlOptions): Promise<string>;

    temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string>;

    prepareUpload?(path: string, options: UploadRequestOptions): Promise<UploadRequest>;

    checksum(path: string, options: ChecksumOptions): Promise<string>;

    mimeType(path: string, options: MimeTypeOptions): Promise<string>;

    lastModified(path: string, options: MiscellaneousOptions): Promise<number>;

    fileSize(path: string, options: MiscellaneousOptions): Promise<number>;
}

export class DirectoryListing implements AsyncIterable<StatEntry> {
    constructor(
        private readonly listing: AsyncGenerator<StatEntry>,
        private readonly path: string,
        private readonly deep: boolean,
    ) {
    }

    async toArray(sorted: boolean = true): Promise<StatEntry[]> {
        const items = [];
        for await (const item of this.listing) {
            items.push(item);
        }

        return sorted ? items.sort((a, b) => naturalSorting.compare(a.path, b.path)) : items;
    }

    filter(filter: (entry: StatEntry) => boolean): DirectoryListing {
        const listing = this.listing;
        const filtered = (async function* () {
            for await (const entry of listing) {
                if (filter(entry)) {
                    yield entry;
                }
            }
        })();

        return new DirectoryListing(filtered, this.path, this.deep);
    }

    async* [Symbol.asyncIterator]() {
        try {
            for await (const item of this.listing) {
                yield item;
            }
        } catch (error) {
            throw UnableToListDirectory.because(
                errorToMessage(error),
                {cause: error, context: {path: this.path, deep: this.deep}},
            );
        }
    }
}

export type FileContents = Iterable<any> | AsyncIterable<any> | NodeJS.ReadableStream | Readable | string;

export type TimeoutOptions = { timout?: number };

export type MiscellaneousOptions = TimeoutOptions & {
    [option: string]: any,
    abortSignal?: AbortSignal,
}

export type MimeTypeOptions = MiscellaneousOptions & {
    disallowFallback?: boolean,
    fallbackMethod?: 'contents' | 'path',
}

export type VisibilityFallback = {
    strategy: 'ignore',
    stagedVisibilityResponse?: string,
} | {
    strategy: 'error',
    errorMessage?: string,
}

export type VisibilityOptions = MiscellaneousOptions & {
    visibility?: string,
    directoryVisibility?: string,
    retainVisibility?: boolean,
} & ({
    useVisibility: true,
} | {
    useVisibility: false,
    visibilityFallback: VisibilityFallback,
} | {});

export type WriteOptions = VisibilityOptions & MiscellaneousOptions & {
    mimeType?: string,
    size?: number,
    cacheControl?: string,
};
export type CreateDirectoryOptions = MiscellaneousOptions & Pick<VisibilityOptions, 'directoryVisibility'> & {};
export type PublicUrlOptions = MiscellaneousOptions & {};
export type UploadRequestOptions = MiscellaneousOptions & {
    expiresAt: ExpiresAt,
    contentType?: string,
    headers?: UploadRequestHeaders,
};
export type CopyFileOptions = MiscellaneousOptions & VisibilityOptions & {
    retainVisibility?: boolean,
};
export type MoveFileOptions = MiscellaneousOptions & VisibilityOptions & {
    retainVisibility?: boolean,
};
export type ListOptions = MiscellaneousOptions & { deep?: boolean };
export type TemporaryUrlOptions = MiscellaneousOptions & {
    expiresAt: ExpiresAt,
    responseHeaders?: { [header: string]: string },
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
    uploadRequest?: UploadRequestOptions,
    checksums?: ChecksumOptions,
    mimeTypes?: MimeTypeOptions,
    preparedUploadStrategy?: PreparedUploadStrategy,
    timeout?: TimeoutOptions,
    list?: ListOptions,
}

export function toReadable(contents: FileContents): Readable {
    if (contents instanceof Readable) {
        return contents;
    }

    return Readable.from(contents);
}

const naturalSorting = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
});

function instrumentAbortSignal<Options extends MiscellaneousOptions>(options: Options): Options {
    let abortSignal = options.abortSignal;

    if (options.timeout !== undefined) {
        const timeoutAbort = AbortSignal.timeout(options.timeout);

        if (options.abortSignal) {
            const originalAbortSignal = options.abortSignal;
            abortSignal = AbortSignal.any([
                originalAbortSignal,
                timeoutAbort,
            ]);
        } else {
            abortSignal = timeoutAbort;
        }
    }

    if (abortSignal?.aborted) {
        throw abortSignal.reason;
    }

    return {...options, abortSignal};
}

export class FileStorage {
    constructor(
        private readonly adapter: StorageAdapter,
        private readonly pathNormalizer: PathNormalizer = new PathNormalizerV1(),
        private readonly options: ConfigurationOptions = {},
    ) {
    }

    public async write(path: string, contents: FileContents, options: WriteOptions = {}): Promise<void> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.visibility, ...this.options.writes, ...options});

        try {
            const body = toReadable(contents);
            await this.adapter.write(
                this.pathNormalizer.normalizePath(path),
                body,
                options,
            );
            await closeReadable(body);
        } catch (error) {
            throw UnableToWriteFile.because(
                errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async read(path: string, options: MiscellaneousOptions = {}): Promise<Readable> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        try {
            const stream = Readable.from(
                await this.adapter.read(this.pathNormalizer.normalizePath(path), options),
            );

            const streamOut = new PassThrough();
            stream.on('error', (error) => {
                stream.unpipe(streamOut);

                streamOut.destroy(
                    isFileWasNotFound(error)
                        ? UnableToReadFile.becauseFileWasNotFound(error)
                        : error,
                );
            });
            stream.pipe(streamOut);

            return streamOut;
        } catch (error) {
            if (isFileWasNotFound(error)) {
                throw UnableToReadFile.becauseFileWasNotFound(error);
            }

            throw UnableToReadFile.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async readToString(path: string, options: MiscellaneousOptions = {}): Promise<string> {
        return await readableToString(await this.read(path, options));
    }

    public async readToUint8Array(path: string, options: MiscellaneousOptions = {}): Promise<Uint8Array> {
        return await readableToUint8Array(await this.read(path, options));
    }

    public async readToBuffer(path: string, options: MiscellaneousOptions = {}): Promise<Buffer> {
        return Buffer.from(await this.readToUint8Array(path, options));
    }

    public async deleteFile(path: string, options: MiscellaneousOptions = {}): Promise<void> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        try {
            await this.adapter.deleteFile(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            throw UnableToDeleteFile.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async createDirectory(path: string, options: CreateDirectoryOptions = {}): Promise<void> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.visibility, ...options});

        try {
            return await this.adapter.createDirectory(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            throw UnableToCreateDirectory.because(
                errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async deleteDirectory(path: string, options: MiscellaneousOptions = {}): Promise<void> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        try {
            return await this.adapter.deleteDirectory(this.pathNormalizer.normalizePath(path), options);
        } catch (error) {
            throw UnableToDeleteDirectory.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async stat(path: string, options: MiscellaneousOptions = {}): Promise<StatEntry> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        try {
            return await this.adapter.stat(this.pathNormalizer.normalizePath(path), options);
        } catch (error) {
            throw UnableToGetStat.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async moveFile(from: string, to: string, options: MoveFileOptions = {}): Promise<void> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.visibility, ...this.options.moves, ...options});

        try {
            await this.adapter.moveFile(
                this.pathNormalizer.normalizePath(from),
                this.pathNormalizer.normalizePath(to),
                options,
            );
        } catch (error) {
            throw UnableToMoveFile.because(
                errorToMessage(error),
                {cause: error, context: {from, to}},
            );
        }
    }

    public async copyFile(from: string, to: string, options: CopyFileOptions = {}): Promise<void> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.visibility, ...this.options.copies, ...options});

        try {
            await this.adapter.copyFile(
                this.pathNormalizer.normalizePath(from),
                this.pathNormalizer.normalizePath(to),
                options,
            );
        } catch (error) {
            throw UnableToCopyFile.because(
                errorToMessage(error),
                {cause: error, context: {from, to}},
            );
        }
    }

    public async changeVisibility(path: string, visibility: string, options: VisibilityOptions = {}): Promise<void> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        if (options.useVisibility === false) {
            const fallback: VisibilityFallback = options.visibilityFallback;

            if (fallback.strategy === 'ignore') {
                return;
            } else if (fallback.strategy === 'error') {
                throw UnableToSetVisibility.because(fallback.errorMessage ?? 'Configured not to use visibility', {
                    context: {path, visibility},
                });
            }
        }

        try {
            return await this.adapter.changeVisibility(this.pathNormalizer.normalizePath(path), visibility, options);
        } catch (error) {
            throw UnableToSetVisibility.because(
                errorToMessage(error),
                {cause: error, context: {path, visibility}},
            );
        }
    }

    public async visibility(path: string, options: VisibilityOptions = {}): Promise<string> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.visibility, ...options});

        if (options.useVisibility === false) {
            const fallback: VisibilityFallback = options.visibilityFallback;

            if (fallback.strategy === 'ignore') {
                return fallback.stagedVisibilityResponse ?? 'unknown';
            } else if (fallback.strategy === 'error') {
                throw UnableToGetVisibility.because(fallback.errorMessage ?? 'Configured not to use visibility', {
                    context: {path},
                });
            }
        }

        try {
            return await this.adapter.visibility(this.pathNormalizer.normalizePath(path), options);
        } catch (error) {
            throw UnableToGetVisibility.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async fileExists(path: string, options: MiscellaneousOptions = {}): Promise<boolean> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        try {
            return await this.adapter.fileExists(this.pathNormalizer.normalizePath(path), options);
        } catch (error) {
            throw UnableToCheckFileExistence.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public list(path: string, options: ListOptions = {}): DirectoryListing {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.list, ...options});

        const adapterOptions: AdapterListOptions = {
            ...options,
            deep: options.deep ?? false,
        };

        return new DirectoryListing(
            this.adapter.list(this.pathNormalizer.normalizePath(path), adapterOptions),
            path,
            adapterOptions.deep,
        );
    }

    public async statFile(path: string, options: MiscellaneousOptions = {}): Promise<FileInfo> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});
        const stat = await this.stat(path, options);

        if (isFile(stat)) {
            return stat;
        }

        throw UnableToGetStat.noFileStatResolved({context: {path}});
    }

    public async directoryExists(path: string, options: MiscellaneousOptions = {}): Promise<boolean> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        try {
            return await this.adapter.directoryExists(this.pathNormalizer.normalizePath(path), options);
        } catch (error) {
            throw UnableToCheckDirectoryExistence.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async publicUrl(path: string, options: PublicUrlOptions = {}): Promise<string> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.publicUrls, ...options});

        try {
            return await this.adapter.publicUrl(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            throw UnableToGetPublicUrl.because(
                errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.temporaryUrls, ...options});

        try {
            return await this.adapter.temporaryUrl(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            throw UnableToGetTemporaryUrl.because(
                errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async prepareUpload(path: string, options: UploadRequestOptions): Promise<UploadRequest> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.uploadRequest, ...options});

        if (this.options.preparedUploadStrategy !== undefined) {
            try {
                return this.options.preparedUploadStrategy.prepareUpload(path, options);
            } catch (error) {
                throw UnableToPrepareUploadRequest.because(
                    errorToMessage(error),
                    {cause: error, context: {path, options}},
                );
            }
        }

        if (typeof this.adapter.prepareUpload !== 'function') {
            throw new Error('The used adapter does not support prepared uploads.');
        }

        try {
            return await this.adapter.prepareUpload(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            throw UnableToPrepareUploadRequest.because(
                errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async checksum(path: string, options: ChecksumOptions = {}): Promise<string> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.checksums, ...options});

        try {
            return await this.adapter.checksum(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            if (ChecksumIsNotAvailable.isErrorOfType(error)) {
                return this.calculateChecksum(path, options);
            }

            throw UnableToGetChecksum.because(
                errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async mimeType(path: string, options: MimeTypeOptions = {}): Promise<string> {
        options = instrumentAbortSignal({...this.options.timeout, ...this.options.mimeTypes, ...options});

        try {
            return await this.adapter.mimeType(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            throw UnableToGetMimeType.because(
                errorToMessage(error),
                {cause: error, context: {path, options}},
            );
        }
    }

    public async lastModified(path: string, options: MiscellaneousOptions = {}): Promise<number> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        try {
            return await this.adapter.lastModified(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            throw UnableToGetLastModified.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    public async fileSize(path: string, options: MiscellaneousOptions = {}): Promise<number> {
        options = instrumentAbortSignal({...this.options.timeout, ...options});

        try {
            return await this.adapter.fileSize(
                this.pathNormalizer.normalizePath(path),
                options,
            );
        } catch (error) {
            throw UnableToGetFileSize.because(
                errorToMessage(error),
                {cause: error, context: {path}},
            );
        }
    }

    private async calculateChecksum(path: string, options: ChecksumOptions): Promise<string> {
        try {
            return await checksumFromStream(await this.read(path, options), options);
        } catch (error) {
            throw UnableToGetChecksum.because(
                errorToMessage(error),
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
    if (body.closed || body.destroyed) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        body.on('error', reject);
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

export async function readableToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const buffers: Buffer[] = [];
        stream.on('data', chunk => buffers.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(buffers)));
        stream.on('finish', () => resolve(Buffer.concat(buffers)));
        stream.on('error', err => reject(err));
    });
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

export type UploadRequestHeaders = Record<string, string | ReadonlyArray<string>>;

export type UploadRequest = {
    url: string,
    provider?: string,
    method: 'PUT' | 'POST'
    headers: UploadRequestHeaders,
}

export interface PreparedUploadStrategy {
    prepareUpload(path: string, options: UploadRequestOptions): Promise<UploadRequest>;
}

export class PreparedUploadsAreNotSupported implements PreparedUploadStrategy {
    prepareUpload(): Promise<UploadRequest> {
        throw new Error('The used adapter does not support prepared uploads.');
    }
}

