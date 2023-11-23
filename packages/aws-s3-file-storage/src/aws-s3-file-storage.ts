import {
    PutObjectCommandInput,
    S3Client,
    DeleteObjectCommand,
    ObjectCannedACL,
    GetObjectCommand, HeadObjectCommand, ListObjectsV2Command
} from '@aws-sdk/client-s3';
import {Configuration, Upload} from '@aws-sdk/lib-storage';
import {
    CreateDirectoryOptions,
    FileContents,
    PathPrefixer,
    StatEntry,
    StorageAdapter, Visibility,
    WriteOptions
} from '@flystorage/file-storage';
import {resolveMimeType} from '@flystorage/stream-mime-type';
import {Readable} from 'stream';
type PutObjectOptions = Omit<PutObjectCommandInput, 'Bucket' | 'Key'>;

export type AwsS3FileStorageOptions = Readonly<{
    bucket: string,
    prefix?: string,
    putObjectOptions?: PutObjectOptions,
    uploadConfiguration?: Partial<Configuration>,
}>;

export class AwsS3FileStorage implements StorageAdapter {
    private readonly prefixer: PathPrefixer;

    constructor(
        private readonly client: S3Client,
        private readonly options: AwsS3FileStorageOptions,
    ) {
        this.prefixer = new PathPrefixer(options.prefix || '');
    }

    async *list(path: string, deep: boolean): AsyncGenerator<StatEntry, any, unknown> {
        let shouldContinue = true;
        let continuationToken: string | undefined;
        const prefix = this.prefixer.prefixDirectoryPath(path);

        while(shouldContinue) {
            const response = await this.client.send(new ListObjectsV2Command({
                Bucket: this.options.bucket,
                Prefix: prefix,
                Delimiter: deep ? '/' : undefined,
                ContinuationToken: continuationToken,
            }));

            continuationToken = response.NextContinuationToken;
            shouldContinue = response.IsTruncated ?? false;

            for (const item of response.CommonPrefixes ?? []) {
                if (item.Prefix === prefix || item.Prefix === undefined) {
                    // not interested in itself
                    // not interested in empty prefixes
                    continue;
                }

                yield {
                    type: 'directory',
                    isFile: false,
                    isDirectory: true,
                    path: this.prefixer.stripDirectoryPath(item.Prefix),
                };
            }

            for (const item of response.Contents ?? []) {
                if (item.Key === prefix || item.Key === undefined) {
                    // not interested in itself
                    // not interested in empty prefixes
                    continue;
                }

                const path = item.Key!;

                if (path.endsWith('/')) {
                    yield {
                        type: 'directory',
                        isFile: false,
                        isDirectory: true,
                        path: this.prefixer.stripDirectoryPath(path),
                    };
                } else {
                    yield {
                        type: 'file',
                        isFile: true,
                        isDirectory: false,
                        path: this.prefixer.stripFilePath(path),
                        size: item.Size ?? 0,
                        lastModifiedMs: item.LastModified?.getMilliseconds(),
                    };
                }
            }
        }
    }

    async read(path: string): Promise<FileContents> {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
        }));

        if (response.Body instanceof Readable) {
            return response.Body;
        }

        throw new Error('No response body was provided');
    }

    async stat(path: string): Promise<StatEntry> {
        const response = await this.client.send(new HeadObjectCommand({
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
        }));

        return {
            path,
            type: 'file',
            isDirectory: false,
            isFile: true,
            size: response.ContentLength ?? 0,
            lastModifiedMs: response.LastModified?.getMilliseconds(),
            mimeType: response.ContentType,
        };
    }

    async createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        await this.upload(this.prefixer.prefixDirectoryPath(path), '', {
            ACL: options.directoryVisibility ? this.visibilityToAcl(options.directoryVisibility) : undefined,
        })
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        let mimeType = options.mimeType;

        if (mimeType === undefined) {
            [mimeType, contents] = await resolveMimeType(path, contents);
        }

        await this.upload(this.prefixer.prefixFilePath(path), contents, {
            ACL: options.visibility ? this.visibilityToAcl(options.visibility) : undefined,
            ContentType: mimeType,
        });
    }

    private async upload(key: string, contents: Readable | '', options: PutObjectOptions) {
        const params: PutObjectCommandInput = {
            Bucket: this.options.bucket,
            Key: key,
            Body: contents,
            ...Object.assign({}, this.options.putObjectOptions, options),
        };
        const upload = new Upload({
            client: this.client,
            params,
            ...this.options.uploadConfiguration,
        });

        await upload.done();
    }

    async deleteFile(path: string): Promise<void> {
        const key = this.prefixer.prefixFilePath(path);
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
        }));
    }

    private visibilityToAcl(visibility: string): ObjectCannedACL {
        if (visibility === Visibility.PUBLIC) {
            return 'public-read';
        } else if (visibility === Visibility.PRIVATE) {
            return 'private';
        }

        throw new Error(`Unrecognized visibility provided; ${visibility}`);
    }

    setVisibility(path: string, visibility: string): Promise<void> {
        return Promise.resolve(undefined);
    }
}