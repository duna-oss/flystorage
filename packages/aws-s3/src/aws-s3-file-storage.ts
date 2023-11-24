import {
    _Object,
    CommonPrefix,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectAclCommand,
    GetObjectAclOutput,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    ListObjectsV2Output,
    ObjectCannedACL,
    PutObjectAclCommand,
    PutObjectCommandInput,
    S3Client,
    S3ServiceException
} from '@aws-sdk/client-s3';
import {Configuration, Upload} from '@aws-sdk/lib-storage';
import {
    CreateDirectoryOptions,
    FileContents,
    PathPrefixer,
    StatEntry,
    StorageAdapter,
    Visibility,
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

    async visibility(path: string): Promise<string> {
        const response: GetObjectAclOutput = await this.client.send(new GetObjectAclCommand({
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
        }));

        const publicRead = response.Grants?.some(grant =>
            grant.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AllUsers'
            && grant.Permission === 'READ'
        ) ?? false;

        return publicRead ? Visibility.PUBLIC : Visibility.PRIVATE;
    }

    async* list(path: string, {deep}: {deep: boolean}): AsyncGenerator<StatEntry, any, unknown> {
        const listing = this.listObjects(path, {
            deep,
            includePrefixes: true,
            includeSelf: false,
        });

        for await (const {type, item} of listing) {
            if (type === 'prefix') {
                yield {
                    type: 'directory',
                    isFile: false,
                    isDirectory: true,
                    path: this.prefixer.stripDirectoryPath(item.Prefix!),
                };
            } else {
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

    async* listObjects(
        path: string,
        options: {
            deep: boolean,
            includePrefixes: boolean,
            includeSelf: boolean,
            maxKeys?: number,
        },
    ): AsyncGenerator<{ type: 'prefix', item: CommonPrefix } | { type: 'object', item: _Object }, any, unknown> {
        let shouldContinue = true;
        let continuationToken: string | undefined = undefined;
        const prefix = this.prefixer.prefixDirectoryPath(path);

        while (shouldContinue) {
            const response: ListObjectsV2Output = await this.client.send(new ListObjectsV2Command({
                Bucket: this.options.bucket,
                Prefix: prefix,
                Delimiter: options.deep ? undefined : '/',
                ContinuationToken: continuationToken,
                MaxKeys: options.maxKeys,
            }));

            continuationToken = response.NextContinuationToken;
            shouldContinue = response.IsTruncated ?? false;
            const prefixes = options.includePrefixes ? response.CommonPrefixes ?? [] : [];

            for (const item of prefixes) {
                if ((!options.includeSelf && item.Prefix === prefix) || item.Prefix === undefined) {
                    continue;
                }

                yield {type: 'prefix', item};
            }

            for (const item of response.Contents ?? []) {
                if ((!options.includeSelf && item.Key === prefix) || item.Key === undefined) {
                    // not interested in itself
                    // not interested in empty prefixes
                    continue;
                }

                yield {type: 'object', item};
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
        });
    }

    async deleteDirectory(path: string): Promise<void> {
        // @ts-ignore because we know it will only be objects
        let itemsToDelete: AsyncGenerator<{ item: _Object }> = this.listObjects(path, {
            deep: true,
            includeSelf: true,
            includePrefixes: false,
        });

        const flush = async (keys: { Key: string }[]) => this.client.send(new DeleteObjectsCommand({
            Bucket: this.options.bucket,
            Delete: {
                Objects: keys,
            },
        }));

        let bucket: { Key: string }[] = [];
        let promises: Promise<any>[] = [];

        for await (const {item} of itemsToDelete) {
            bucket.push({Key: item.Key!});

            if (bucket.length > 1000) {
                promises.push(flush(bucket));
                bucket = [];
            }
        }

        if (bucket.length > 0) {
            promises.push(flush(bucket));
        }

        await Promise.all(promises);
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        let mimeType = options.mimeType;

        if (mimeType === undefined) {
            [mimeType, contents] = await resolveMimeType(path, contents);
        }

        await this.upload(this.prefixer.prefixFilePath(path), contents, {
            ACL: options.visibility ? this.visibilityToAcl(options.visibility) : undefined,
            ContentType: mimeType,
            ContentLength: options.size,
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

    async changeVisibility(path: string, visibility: string): Promise<void> {
        await this.client.send(new PutObjectAclCommand({
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
            ACL: this.visibilityToAcl(visibility),
        }));
    }

    async fileExists(path: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.options.bucket,
                Key: this.prefixer.prefixFilePath(path),
            }));

            return true;
        } catch (e) {
            if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404) {
                return false;
            }

            throw e;
        }
    }

    async directoryExists(path: string): Promise<boolean> {
        const listing = this.listObjects(path, {
            deep: true,
            includePrefixes: true,
            includeSelf: true,
            maxKeys: 1,
        });

        for await (const _item of listing) {
            return true;
        }

        return false;
    }
}