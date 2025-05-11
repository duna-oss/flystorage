import {Readable} from 'stream';
import {
    ChecksumIsNotAvailable,
    ChecksumOptions,
    CopyFileOptions,
    FileContents,
    FileWasNotFound,
    ListOptions,
    MimeTypeOptions,
    MiscellaneousOptions,
    MoveFileOptions,
    normalizeExpiryToDate,
    PathPrefixer,
    PublicUrlOptions,
    StatEntry,
    StorageAdapter,
    TemporaryUrlOptions,
    UploadRequest,
    UploadRequestHeaders,
    UploadRequestOptions,
    WriteOptions,
} from '@flystorage/file-storage';
import {
    BlobDownloadResponseParsed,
    BlobGenerateSasUrlOptions,
    BlobGetPropertiesResponse,
    BlobProperties,
    BlobSASPermissions,
    ContainerClient,
} from '@azure/storage-blob';
import {resolveMimeType} from '@flystorage/stream-mime-type';
import {dirname} from 'node:path';


export type AzureStorageBlobStorageAdapterOptions = {
    prefix?: string,
    uploadMaxConcurrency?: number,
    ignoreVisibility?: boolean,
    ignoredVisibilityResponse?: string,
    deleteDirBatchSize?: number,
    temporaryUrlOptions?: TemporaryUrlOptions,
}

function maybeAbort(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw signal.reason;
    }
}

export class AzureStorageBlobStorageAdapter implements StorageAdapter {
    private readonly prefixer: PathPrefixer;

    constructor(
        private readonly container: ContainerClient,
        private readonly options: AzureStorageBlobStorageAdapterOptions = {},
    ) {
        this.prefixer = new PathPrefixer(options.prefix || '');
    }

    async copyFile(from: string, to: string, options: CopyFileOptions): Promise<void> {
        const fromUrl = this.blockClient(from).url;
        maybeAbort(options.abortSignal);
        await this.blockClient(to).syncCopyFromURL(fromUrl, {abortSignal: options.abortSignal});
    }
    async moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        await this.copyFile(from, to, options);
        await this.deleteFile(from, options);
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        let mimeType = options.mimeType;
        let stream = contents;

        maybeAbort(options.abortSignal);

        if (mimeType === undefined) {
            [mimeType, stream] = await this.resolveMimetype(path, contents, options);
        }

        maybeAbort(options.abortSignal);

        const blob = this.blockClient(path);
        await blob.uploadStream(
            stream,
            options.size,
            this.options.uploadMaxConcurrency,
            {
                abortSignal: options.abortSignal,
                blobHTTPHeaders: {
                    blobContentType: mimeType,
                    blobCacheControl: options.cacheControl
                },
            },
        );
    }

    private blockClient(path: string) {
        return this.container.getBlockBlobClient(this.prefixer.prefixFilePath(path));
    }

    async read(path: string, options: MiscellaneousOptions): Promise<FileContents> {
        maybeAbort(options.abortSignal);
        const blob = this.blockClient(path);
        let response: BlobDownloadResponseParsed;

        try {
            response = await blob.download(undefined, undefined, {
                abortSignal: options.abortSignal,
            });
        } catch (err) {
            if ((err as any).statusCode === 404) {
                throw FileWasNotFound.atLocation(path, {
                    context: {path, options},
                    cause: err,
                })
            }

            throw err;
        }

        if (!response.readableStreamBody) {
            throw new Error('No readable stream body in response.');
        }

        return response.readableStreamBody;
    }

    async deleteFile(path: string, options: MiscellaneousOptions): Promise<void> {
        const blob = this.blockClient(path);
        maybeAbort(options.abortSignal);
        await blob.deleteIfExists({
            abortSignal: options.abortSignal,
        });
    }

    async createDirectory(): Promise<void> {
        // no-op, directories do not exist.
    }

    async stat(path: string, options: {abortSignal?: AbortSignal} = {}): Promise<StatEntry> {
        maybeAbort(options.abortSignal);

        const blob = this.blockClient(path);
        const properties = await blob.getProperties({
            abortSignal: options.abortSignal,
        });

        return this.mapToStatEntry(path, properties);
    }

    private mapToStatEntry(path: string, properties: BlobGetPropertiesResponse | BlobProperties): StatEntry {
        return {
            type: 'file',
            isFile: true,
            isDirectory: false,
            path,
            mimeType: properties.contentType,
            size: properties.contentLength,
            lastModifiedMs: properties.lastModified?.getTime(),
        };
    }

    list(path: string, options: ListOptions): AsyncGenerator<StatEntry> {
        return options.deep
            ? this.listDeep(path, options)
            : this.listShallow(path, options);

    }

    async *listDeep(path: string, options: ListOptions): AsyncGenerator<StatEntry> {
        maybeAbort(options?.abortSignal);
        const directories = new Set<string>();
        const listing = this.container.listBlobsFlat({
            prefix: this.prefixer.prefixDirectoryPath(path),
            abortSignal: options.abortSignal,
        });
        const listedPath = path;

        for await (const item of listing) {
            maybeAbort(options?.abortSignal);
            const path = this.prefixer.stripFilePath(item.name);
            let parentDir = dirname(path);

            while(!['.', '', listedPath].includes(parentDir)) {
                if (directories.has(parentDir)) {
                    break;
                }

                yield {
                    type: 'directory',
                    isFile: false,
                    isDirectory: true,
                    path: parentDir,
                };

                directories.add(parentDir);
                parentDir = dirname(parentDir);
            }

            yield this.mapToStatEntry(path, item.properties);
        }
    }

    async *listShallow(path: string, options: ListOptions): AsyncGenerator<StatEntry> {
        maybeAbort(options?.abortSignal);

        const listing = this.container.listBlobsByHierarchy('/', {
            prefix: this.prefixer.prefixDirectoryPath(path),
            abortSignal: options.abortSignal,
        });

        for await (const item of listing) {
            maybeAbort(options?.abortSignal);

            if (item.kind === 'blob') {
                yield this.mapToStatEntry(
                    this.prefixer.stripFilePath(item.name),
                    item.properties
                )
            } else {
                yield {
                    path: this.prefixer.stripDirectoryPath(item.name),
                    type: 'directory',
                    isFile: false,
                    isDirectory: true,
                }
            }
        }
    }

    async changeVisibility(path: string, visibility: string): Promise<void> {
        if (this.options.ignoreVisibility !== true) {
            throw new Error('Not supported by this adapter');
        }
    }
    async visibility(path: string): Promise<string> {
        if (this.options.ignoreVisibility !== true) {
            throw new Error('Not implemented');
        }

        // default to indicating it ss public because we cannot know if the default is private
        return this.options.ignoredVisibilityResponse ?? 'public';
    }
    async deleteDirectory(path: string, options: MiscellaneousOptions): Promise<void> {
        let deletes: Promise<any>[] = [];
        const batchSize = this.options.deleteDirBatchSize ?? 10;

        for await (const item of this.list(path, {deep: true})) {
            if (item.isFile) {
                deletes.push(this.deleteFile(item.path, options));
            }

            if (deletes.length >= batchSize) {
                await Promise.all(deletes);
                deletes = [];
            }

        }

        await Promise.all(deletes);
    }
    async fileExists(path: string, options: MiscellaneousOptions): Promise<boolean> {
        maybeAbort(options.abortSignal);
        return await this.blockClient(path).exists({
            abortSignal: options.abortSignal,
        })
    }
    async directoryExists(path: string, options: MiscellaneousOptions): Promise<boolean> {
        maybeAbort(options.abortSignal);
        const listing = this.container.listBlobsFlat({
            prefix: this.prefixer.prefixDirectoryPath(path),
            abortSignal: options.abortSignal,
        }).byPage({
            maxPageSize: 1,
        });

        return (await listing.next()).value.segment.blobItems.length > 0;
    }
    async publicUrl(path: string, options?: PublicUrlOptions): Promise<string> {
        return this.blockClient(path).url;
    }
    async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        return await this.blockClient(path).generateSasUrl({
            expiresOn: normalizeExpiryToDate(options.expiresAt),
            permissions: BlobSASPermissions.parse('r'),
            ...(this.options.temporaryUrlOptions ?? {}),
        });
    }

    async prepareUpload(path: string, options: UploadRequestOptions): Promise<UploadRequest> {
        const headers: UploadRequestHeaders = {};
        headers['x-ms-blob-type'] = options['x-ms-blob-type'] ?? 'BlockBlob';
        const config: BlobGenerateSasUrlOptions = {
            expiresOn: normalizeExpiryToDate(options.expiresAt),
            permissions: BlobSASPermissions.parse('w'),
            ...(this.options.temporaryUrlOptions ?? {}),
        };


        const contentType = options['Content-Type'] ?? options.contentType;

        if (typeof contentType === 'string') {
            config.contentType = contentType;
            headers['Content-Type'] = contentType;
        }

        const url = await this.blockClient(path).generateSasUrl(config);

        return {method: 'PUT', provider: 'azure-storage-blob', url, headers};
    }

    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        maybeAbort(options?.abortSignal);
        const algo = options.algo ?? 'etag';

        if (algo !== 'etag') {
            throw ChecksumIsNotAvailable.checksumNotSupported(algo);
        }

        const blob = this.blockClient(path);
        const properties = await blob.getProperties({abortSignal: options.abortSignal});
        const etag = properties.etag;

        if (etag === undefined) {
            throw new Error('Etag is not defined on blob properties.');
        }

        return etag;
    }

    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        const stat = await this.stat(path, options);

        if (stat.isDirectory) {
            throw new Error('Path is not a file. No mimetype available.');
        }

        if (stat.mimeType === undefined) {
            throw new Error('Mime-type not found for file.');
        }

        return stat.mimeType;
    }

    async lastModified(path: string): Promise<number> {
        const stat = await this.stat(path);

        if (stat.isDirectory) {
            throw new Error('Path is not a file. No last modified available.');
        }

        if (stat.lastModifiedMs === undefined) {
            throw new Error('Last modified not found for file.');
        }

        return stat.lastModifiedMs;
    }

    async fileSize(path: string): Promise<number> {
        const stat = await this.stat(path);

        if (stat.isDirectory) {
            throw new Error('Path is not a file. No file size available.');
        }

        if (stat.size === undefined) {
            throw new Error('File size not found for file.');
        }

        return stat.size;
    }

    private async resolveMimetype(path: string, contents: Readable, options: WriteOptions): Promise<[string, Readable]> {
        if (options.mimeType) {
            return [options.mimeType, contents];
        }

        const [mimeType, stream] = await resolveMimeType(path, contents);

        return [mimeType ?? 'application/octet-stream', stream];
    }
}

/**
 * BC export
 *
 * @deprecated
 */
export class AzureStorageBlobFileStorage extends AzureStorageBlobStorageAdapter {}