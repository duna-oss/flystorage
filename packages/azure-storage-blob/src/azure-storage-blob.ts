import {Readable} from "stream";
import {
    ChecksumOptions,
    CopyFileOptions,
    FileContents,
    ListOptions,
    MimeTypeOptions,
    MoveFileOptions,
    PathPrefixer,
    PublicUrlOptions,
    StatEntry,
    StorageAdapter,
    TemporaryUrlOptions,
    WriteOptions,
    normalizeExpiryToDate,
} from "@flystorage/file-storage";
import {
    BlobGetPropertiesResponse,
    BlobProperties,
    BlobSASPermissions,
    ContainerClient,
} from '@azure/storage-blob';
import {resolveMimeType} from "@flystorage/stream-mime-type";
import {dirname} from 'node:path';


export type AzureStorageBlobStorageAdapterOptions = {
    prefix?: string,
    uploadMaxConcurrency?: number,
    ignoreVisibility?: boolean,
    ignoredVisibilityResponse?: string,
    deleteDirBatchSize?: number,
    temporaryUrlOptions?: TemporaryUrlOptions,
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
        await this.blockClient(to).syncCopyFromURL(fromUrl)
    }
    async moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        await this.copyFile(from, to, options);
        await this.deleteFile(from);
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        let mimeType = options.mimeType;
        let stream = contents;

        if (mimeType === undefined) {
            [mimeType, stream] = await this.resolveMimetype(path, contents, options);
        }

        const blob = this.blockClient(path);
        await blob.uploadStream(
            stream,
            options.size,
            this.options.uploadMaxConcurrency,
            {
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

    async read(path: string): Promise<FileContents> {
        const blob = this.blockClient(path);
        const response = await blob.download();

        if (!response.readableStreamBody) {
            throw new Error('No readable stream body in response.');
        }

        return response.readableStreamBody;
    }

    async deleteFile(path: string): Promise<void> {
        const blob = this.blockClient(path);
        await blob.deleteIfExists();
    }
    async createDirectory(): Promise<void> {
        // no-op, directories do not exist.
    }
    async stat(path: string): Promise<StatEntry> {
        const blob = this.blockClient(path);
        const properties = await blob.getProperties();

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

    async *listDeep(path: string, options?: ListOptions): AsyncGenerator<StatEntry> {
        const directories = new Set<string>();
        const listing = this.container.listBlobsFlat({
            prefix: this.prefixer.prefixDirectoryPath(path),
        });
        const listedPath = path;

        for await (const item of listing) {
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

    async *listShallow(path: string, options?: ListOptions): AsyncGenerator<StatEntry> {
        const listing = this.container.listBlobsByHierarchy('/', {
            prefix: this.prefixer.prefixDirectoryPath(path),
        });

        for await (const item of listing) {
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
    async deleteDirectory(path: string): Promise<void> {
        let deletes: Promise<any>[] = [];
        const batchSize = this.options.deleteDirBatchSize ?? 10;

        for await (const item of this.list(path, {deep: true})) {
            if (item.isFile) {
                deletes.push(this.deleteFile(item.path));
            }

            if (deletes.length >= batchSize) {
                await Promise.all(deletes);
                deletes = [];
            }

        }

        await Promise.all(deletes);
    }
    async fileExists(path: string): Promise<boolean> {
        return await this.blockClient(path).exists()
    }
    async directoryExists(path: string): Promise<boolean> {
        const listing = this.container.listBlobsFlat({
            prefix: this.prefixer.prefixDirectoryPath(path),
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
    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        throw new Error('Not implemented');
    }
    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        const stat = await this.stat(path);

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