import {
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
    WriteOptions,
} from '@flystorage/file-storage';
import {Readable} from 'stream';
import {Bucket, GetFilesOptions, File} from '@google-cloud/storage';
import {resolveMimeType, streamHead} from '@flystorage/stream-mime-type';
import {pipeline} from 'node:stream/promises';

export type GoogleCloudStorageFileStorageOptions = {
    prefix?: string,
}


export class GoogleCloudStorageFileStorage implements StorageAdapter {
    private readonly prefixer: PathPrefixer;
    constructor(
        private readonly bucket: Bucket,
        private readonly options: GoogleCloudStorageFileStorageOptions,
    ) {
        this.prefixer = new PathPrefixer(options.prefix ?? '');
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        let mimeType = options.mimeType;

        if (mimeType === undefined) {
            [mimeType, contents] = await resolveMimeType(path, contents);
        }

        const writeStream = this.bucket.file(this.prefixer.prefixFilePath(path))
            .createWriteStream({contentType: mimeType});

        await pipeline(contents, writeStream);
    }

    async read(path: string): Promise<FileContents> {
        const readStream = this.bucket.file(this.prefixer.prefixFilePath(path)).createReadStream();
        const [, outStream] = await streamHead(readStream, 10);

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
        throw new Error('Method not implemented.');
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
        throw new Error('Method not implemented.');
    }

    async visibility(path: string): Promise<string> {
        throw new Error('Method not implemented.');
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
        throw new Error('Method not implemented.');
    }

    async publicUrl(path: string, options: PublicUrlOptions): Promise<string> {
        throw new Error('Method not implemented.');
    }

    async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        throw new Error('Method not implemented.');
    }

    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        throw new Error('Method not implemented.');
    }

    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        throw new Error('Method not implemented.');
    }

    async lastModified(path: string): Promise<number> {
        throw new Error('Method not implemented.');
    }

    async fileSize(path: string): Promise<number> {
        throw new Error('Method not implemented.');
    }

}