import {Readable} from "stream";
import {
    ChecksumOptions,
    CopyFileOptions,
    FileContents,
    MimeTypeOptions,
    MoveFileOptions,
    PathPrefixer,
    PublicUrlOptions,
    StatEntry,
    StorageAdapter,
    TemporaryUrlOptions,
    WriteOptions,
} from "@flystorage/file-storage";
import {ContainerClient, generateBlobSASQueryParameters} from '@azure/storage-blob';
import {resolveMimeType} from "@flystorage/stream-mime-type";

export type AzureStorageBlobFileStorageOptions = {
    prefix?: string,
    uploadMaxConcurrency?: number,
}

export class AzureStorageBlobFileStorage implements StorageAdapter {
    private readonly prefixer: PathPrefixer;

    constructor(
        private readonly container: ContainerClient,
        private readonly options: AzureStorageBlobFileStorageOptions = {},
    ) {
        this.prefixer = new PathPrefixer(options.prefix || '');
    }

    copyFile(from: string, to: string, options: CopyFileOptions): Promise<void> {
        throw new Error("Method not implemented.");
    }
    moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        const [mimeType, stream] = await this.resolveMimetype(path, contents, options);
        const blob = this.blockClient(path);
        await blob.uploadStream(
            stream,
            options.size,
            this.options.uploadMaxConcurrency,
            {
                blobHTTPHeaders: {
                    blobContentType: mimeType,
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

        return {
            type: 'file',
            isFile: true,
            isDirectory: false,
            path,
            mimeType: properties.contentType,
            size: properties.contentLength,
            lastModifiedMs: properties.lastModified?.getTime(),
        }
    }
    list(path: string, options: {deep: boolean}): AsyncGenerator<StatEntry> {
        throw new Error('Not implemented');
    }
    async changeVisibility(path: string, visibility: string): Promise<void> {
        throw new Error('Not implemented');
    }
    async visibility(path: string): Promise<string> {
        throw new Error('Not implemented');
    }
    async deleteDirectory(path: string): Promise<void> {
        throw new Error('Not implemented');
    }
    async fileExists(path: string): Promise<boolean> {
        throw new Error('Not implemented');
    }
    async directoryExists(path: string): Promise<boolean> {
        throw new Error('Not implemented');
    }
    async publicUrl(path: string, options: PublicUrlOptions): Promise<string> {
        return this.blockClient(path).url;
    }
    async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        throw new Error('Not implemented');
    }
    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        throw new Error('Not implemented');
    }
    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        throw new Error('Not implemented');
    }
    async lastModified(path: string): Promise<number> {
        throw new Error('Not implemented');
    }
    async fileSize(path: string): Promise<number> {
        throw new Error('Not implemented');
    }

    private async resolveMimetype(path: string, contents: Readable, options: WriteOptions): Promise<[string, Readable]> {
        if (options.mimeType) {
            return [options.mimeType, contents];
        }

        const [mimeType, stream] = await resolveMimeType(path, contents);

        return [mimeType ?? 'application/octet-stream', stream];
    }
}