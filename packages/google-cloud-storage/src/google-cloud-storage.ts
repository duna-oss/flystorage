import {
    ChecksumIsNotAvailable,
    ChecksumOptions,
    CopyFileOptions,
    CreateDirectoryOptions,
    FileContents,
    MimeTypeOptions,
    MoveFileOptions,
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
import {Readable} from 'stream';
import {Bucket, GetFilesOptions, File, GetSignedUrlConfig} from '@google-cloud/storage';
import {resolveMimeType, streamHead} from '@flystorage/stream-mime-type';
import {pipeline} from 'node:stream/promises';
import {
    UniformBucketLevelAccessVisibilityHandling,
    VisibilityHandlingForGoogleCloudStorage,
} from './visibility-handling.js';

export type GoogleCloudStorageAdapterOptions = {
    prefix?: string,
}

export class GoogleCloudStorageAdapter implements StorageAdapter {
    private readonly prefixer: PathPrefixer;
    constructor(
        private readonly bucket: Bucket,
        readonly options: GoogleCloudStorageAdapterOptions = {},
        readonly visibilityHandling: VisibilityHandlingForGoogleCloudStorage = new UniformBucketLevelAccessVisibilityHandling()
    ) {
        this.prefixer = new PathPrefixer(options.prefix ?? '');
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        let mimeType = options.mimeType;

        if (mimeType === undefined) {
            [mimeType, contents] = await resolveMimeType(path, contents);
        }

        const writeStream = this.bucket.file(this.prefixer.prefixFilePath(path))
            .createWriteStream({
                contentType: mimeType,
                predefinedAcl: options.visibility
                    ? this.visibilityHandling.visibilityToPredefinedAcl(options.visibility)
                    : undefined,
                metadata: options.cacheControl? {cacheControl: options.cacheControl} : undefined,
            });

        await pipeline(contents, writeStream);
    }

    async read(path: string): Promise<FileContents> {
        const readStream = this.bucket.file(this.prefixer.prefixFilePath(path)).createReadStream();
        // force retrieval of the head to ensure the http call is made
        // this ensures the error from the HTTP call is caught at the
        // abstraction level
        const [_, outStream] = await streamHead(readStream, 10);

        return outStream;
    }

    async deleteFile(path: string): Promise<void> {
        await this.bucket.file(this.prefixer.prefixFilePath(path)).delete({
            ignoreNotFound: true,
        });
    }

    async createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        await this.bucket.file(this.prefixer.prefixDirectoryPath(path)).save('');
    }

    async copyFile(from: string, to: string, options: CopyFileOptions): Promise<void> {
        await this.bucket.file(this.prefixer.prefixFilePath(from)).copy(
            this.bucket.file(this.prefixer.prefixFilePath(to)),
        );
    }

    async moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        await this.copyFile(from, to, {});
        await this.deleteFile(from);
    }

    async stat(path: string): Promise<StatEntry> {
        const [metadata] = await this.bucket.file(this.prefixer.prefixFilePath(path)).getMetadata();

        return this.mapToStatEntry(metadata);
    }

    async* list(path: string, options: { deep: boolean; }): AsyncGenerator<StatEntry, any, unknown> {
        let response: File[];
        let query: GetFilesOptions | null = {
            autoPaginate: false,
            delimiter: options.deep ? undefined : '/',
            includeTrailingDelimiter: options.deep ? undefined : true,
            prefix: this.prefixer.prefixDirectoryPath(path),
        }

        while (query !== null) {
            [response, query] = await this.bucket.getFiles(query);

            for (const item of response) {
                yield this.mapToStatEntry(item.metadata);
            }
        }
    }

    private mapToStatEntry(file: File['metadata']): StatEntry {
        if (file.name!.endsWith('/')) {
            return {
                type: 'directory',
                isFile: false,
                isDirectory: true,
                path: this.prefixer.stripDirectoryPath(file.name!),
            };
        }

        return {
            type: 'file',
            isFile: true,
            isDirectory: false,
            path: this.prefixer.stripFilePath(file.name!),
            lastModifiedMs: file.updated ? new Date(file.updated).getTime() : undefined,
            mimeType: file.contentType,
        };
    }

    async changeVisibility(path: string, visibility: string): Promise<void> {
        await this.visibilityHandling.changeVisibility(
            this.bucket.file(this.prefixer.prefixFilePath(path)),
            visibility,
        );
    }

    async visibility(path: string): Promise<string> {
        return await this.visibilityHandling.determineVisibility(
            this.bucket.file(this.prefixer.prefixFilePath(path)),
        );
    }

    async deleteDirectory(path: string): Promise<void> {
        const prefix = this.prefixer.prefixDirectoryPath(path);
        await this.bucket.deleteFiles({
            prefix,
        });
        await this.bucket.file(prefix).delete({
            ignoreNotFound: true,
        });
    }

    async fileExists(path: string): Promise<boolean> {
        const [exists] = await this.bucket.file(this.prefixer.prefixFilePath(path)).exists();

        return exists;
    }

    async directoryExists(path: string): Promise<boolean> {
        const [exists] = await this.bucket.file(this.prefixer.prefixDirectoryPath(path)).exists();

        if (exists) {
            return true;
        }

        const [response] = await this.bucket.getFiles({
            autoPaginate: false,
            maxResults: 1,
            prefix: this.prefixer.prefixDirectoryPath(path),
        });

        return response.length > 0;
    }

    async publicUrl(path: string, options: PublicUrlOptions): Promise<string> {
        return this.bucket.file(this.prefixer.prefixFilePath(path)).publicUrl();
    }

    async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        const [response] = await this.bucket.file(this.prefixer.prefixFilePath(path)).getSignedUrl({
            action: 'read',
            expires: options.expiresAt,
        });

        return response;
    }

    async prepareUpload(path: string, options: UploadRequestOptions): Promise<UploadRequest> {
        const headers: UploadRequestHeaders = {};
        const config: GetSignedUrlConfig = {
            action: 'write',
            expires: options.expiresAt,
        };

        const contentType = options['Content-Type'] ?? options.contentType;

        if (typeof contentType === 'string') {
            config.contentType = contentType;
            headers['Content-Type'] = contentType;
        }

        const [url] = await this.bucket.file(this.prefixer.prefixFilePath(path)).getSignedUrl(config);

        return {
            url,
            headers,
            method: 'PUT',
            provider: 'google-cloud-storage',
        };
    }

    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        const algo = options.algo ?? 'md5';

        if (algo !== 'md5' && algo !== 'crc32c') {
            throw ChecksumIsNotAvailable.checksumNotSupported(algo);
        }

        const [metadata] = await this.bucket.file(this.prefixer.prefixFilePath(path)).getMetadata();

        return algo === 'crc32c' ? metadata.crc32c! : metadata.md5Hash!;
    }

    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        const stat = await this.stat(path);

        if (stat.type !== 'file' || stat.mimeType === undefined) {
            throw new Error('Unable to resolve mime-type, not available in stat entry.');
        }

        return stat.mimeType;
    }

    async lastModified(path: string): Promise<number> {
        const stat = await this.stat(path);

        if (stat.type !== 'file' || stat.lastModifiedMs === undefined) {
            throw new Error('Unable to resolve last modified time, not available in stat entry.');
        }

        return stat.lastModifiedMs;
    }

    async fileSize(path: string): Promise<number> {
        const stat = await this.stat(path);

        if (stat.type !== 'file' || stat.size === undefined) {
            throw new Error('Unable to resolve file size, not available in stat entry.');
        }

        return stat.size;
    }

}

/**
 * BC export
 *
 * @deprecated
 */
export class GoogleCloudFileStorage extends GoogleCloudStorageAdapter {}
