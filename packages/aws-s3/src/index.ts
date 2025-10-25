import {
    _Object,
    CommonPrefix,
    CopyObjectCommand,
    CopyObjectRequest,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectAclCommand,
    GetObjectAclOutput,
    GetObjectCommand,
    GetObjectCommandInput,
    GetObjectCommandOutput,
    HeadObjectCommand,
    ListObjectsV2Command,
    ListObjectsV2Output,
    ObjectCannedACL,
    PutObjectAclCommand,
    PutObjectCommand,
    PutObjectCommandInput,
    S3Client,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import {Configuration, Upload} from '@aws-sdk/lib-storage';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {posix} from 'node:path';
import {
    AdapterListOptions,
    ChecksumIsNotAvailable,
    ChecksumOptions,
    closeReadable,
    CopyFileOptions,
    CreateDirectoryOptions,
    FileContents,
    FileWasNotFound,
    MimeTypeOptions,
    MiscellaneousOptions,
    MoveFileOptions,
    normalizeExpiryToMilliseconds,
    PathPrefixer,
    PublicUrlOptions,
    StatEntry,
    StorageAdapter,
    TemporaryUrlOptions,
    UploadRequest,
    UploadRequestHeaders,
    UploadRequestOptions,
    Visibility,
    WriteOptions,
} from '@flystorage/file-storage';
import {resolveMimeType} from '@flystorage/stream-mime-type';
import {Readable} from 'stream';
import {lookup} from 'mime-types';

type PutObjectOptions = Omit<PutObjectCommandInput, 'Bucket' | 'Key' | 'Body'>;
export type WriteOptionsForS3 = Omit<PutObjectOptions, 'ACL' | 'ContentLength'>;
const possibleChecksumAlgos = ['SHA1', 'SHA256', 'CRC32', 'CRC32C', 'ETAG'] as const;
type ChecksumAlgo = typeof possibleChecksumAlgos[number];

function isSupportedAlgo(algo: string): algo is ChecksumAlgo {
    return possibleChecksumAlgos.includes(algo as ChecksumAlgo);
}

export type AwsS3StorageAdapterOptions = Readonly<{
    bucket: string,
    prefix?: string,
    region?: string,
    publicUrlOptions?: PublicUrlOptions,
    uploadRequestOptions?: UploadRequestOptions,
    putObjectOptions?: PutObjectOptions,
    uploadConfiguration?: Partial<Omit<Configuration, 'abortController'>>,
    defaultChecksumAlgo?: ChecksumAlgo,
}>;

export type AwsPublicUrlOptions = PublicUrlOptions & {
    bucket: string,
    region?: string,
    forcePathStyle?: boolean,
    baseUrl?: string,
}

export type AwsPublicUrlGenerator = {
    publicUrl(path: string, options: AwsPublicUrlOptions): Promise<string>;
};

export class DefaultAwsPublicUrlGenerator implements AwsPublicUrlGenerator {
    async publicUrl(path: string, options: AwsPublicUrlOptions): Promise<string> {
        const baseUrl = options.baseUrl ?? 'https://{subdomain}.amazonaws.com/{uri}';
        const subdomain = options.forcePathStyle !== true
            ? `${options.bucket}.s3`
            : options.region === undefined
                ? 's3'
                : `s3-${options.region}`;
        const uri = options.forcePathStyle !== true
            ? encodePath(path)
            : `${options.bucket}/${encodePath(path)}`;

        return baseUrl.replace('{subdomain}', subdomain).replace('{uri}', uri);
    }
}

/**
 * BC extension
 */
export class HostStyleAwsPublicUrlGenerator extends DefaultAwsPublicUrlGenerator {
}

export type TimestampResolver = () => number;
type AclOptions = Pick<CopyObjectRequest, 'ACL'>;

/**
 * Some commands need URI encoded paths to work ¯\_(ツ)_/¯
 */
function encodePath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
}

function maybeAbort(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw signal.reason;
    }
}

export class AwsS3StorageAdapter implements StorageAdapter {
    private readonly prefixer: PathPrefixer;

    constructor(
        private readonly client: S3Client,
        private readonly options: AwsS3StorageAdapterOptions,
        private readonly publicUrlGenerator: AwsPublicUrlGenerator = new DefaultAwsPublicUrlGenerator(),
        private readonly timestampResolver: TimestampResolver = () => Date.now(),
    ) {
        this.prefixer = new PathPrefixer(options.prefix ?? '', '/', (...paths) => {
            const path = posix.join(...paths);

            if (path === "." || path === "/") {
                // 1) https://nodejs.org/api/path.html#pathjoinpaths
                // Zero-length path segments are ignored. If the joined path string is a zero-length string then '.' will be
                // returned, representing the current working directory.
                // 2) In S3 we use delimiter:"/". In that case we need to remove the root-slash in order to list the
                // root-directory contents.
                return "";
            } else {
                return path;
            }
        });
    }

    async copyFile(from: string, to: string, options: CopyFileOptions): Promise<void> {
        maybeAbort(options.abortSignal);
        let visibility: string | undefined = options.visibility;

         if (visibility === undefined && options.retainVisibility) {
            visibility = await this.visibility(from, options);
            maybeAbort(options.abortSignal);
        }

        let acl: AclOptions = (visibility !== undefined && options.useVisibility !== false)
            ? {ACL: this.visibilityToAcl(visibility)}
            : {};

        await this.client.send(new CopyObjectCommand({
            Bucket: this.options.bucket,
            CopySource: posix.join('/', this.options.bucket, encodePath(this.prefixer.prefixFilePath(from))),
            Key: this.prefixer.prefixFilePath(to),
            ...acl,
        }), {abortSignal: options.abortSignal});
    }
    async moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        await this.copyFile(from, to, options);
        await this.deleteFile(from, options);
    }

    async prepareUpload(path: string, options: UploadRequestOptions): Promise<UploadRequest> {
        maybeAbort(options.abortSignal);
        const expiry = normalizeExpiryToMilliseconds(options.expiresAt);
        const now = (this.timestampResolver)();

        const putObjectParams: PutObjectCommandInput = {
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
        };

        const headers: UploadRequestHeaders = {};
        const contentType = options['Content-Type'] ?? options.contentType;

        if (typeof contentType === 'string') {
            putObjectParams.ContentType = contentType;
            headers['Content-Type'] = contentType;
        }

        const url = await getSignedUrl(this.client, new PutObjectCommand(putObjectParams), {
            expiresIn: Math.floor((expiry - now) / 1000),
        });

        return {
            url,
            method: 'PUT',
            provider: 'aws-s3',
            headers,
        };
    }

    async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        maybeAbort(options.abortSignal);
        const expiry = normalizeExpiryToMilliseconds(options.expiresAt);
        const now = (this.timestampResolver)();

        const getObjectParams: GetObjectCommandInput = {
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
        };

        if (options.responseHeaders) {
            if (options.responseHeaders['Cache-Control']) {
                getObjectParams.ResponseCacheControl = options.responseHeaders['Cache-Control'];
            }

            if (options.responseHeaders['Content-Disposition']) {
                getObjectParams.ResponseContentDisposition = options.responseHeaders['Content-Disposition'];
            }

            if (options.responseHeaders['Content-Encoding']) {
                getObjectParams.ResponseContentEncoding = options.responseHeaders['Content-Encoding'];
            }

            if (options.responseHeaders['Content-Language']) {
                getObjectParams.ResponseContentLanguage = options.responseHeaders['Content-Language'];
            }

            if (options.responseHeaders['Content-Type']) {
                getObjectParams.ResponseContentType = options.responseHeaders['Content-Type'];
            }

            if (options.responseHeaders['Expires']) {
                getObjectParams.ResponseExpires = new Date(options.responseHeaders['Expires']);
            }
        }

        return await getSignedUrl(this.client, new GetObjectCommand(getObjectParams), {
            expiresIn: Math.floor((expiry - now) / 1000),
        });
    }

    async lastModified(path: string, options: MiscellaneousOptions): Promise<number> {
        const stat = await this.stat(path, options);

        if (stat.lastModifiedMs === undefined) {
            throw new Error('Last modified is not available in stat');
        }

        return stat.lastModifiedMs;
    }

    async fileSize(path: string, options: MiscellaneousOptions): Promise<number> {
        const stat = await this.stat(path, options);

        if (stat.isFile === false) {
            throw new Error('Path is not a file');
        }

        if (stat.size === undefined) {
            throw new Error('File size is not available in stat.')
        }

        return stat.size;
    }

    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        const response = await this.stat(path, options);

        if (!response.isFile) {
            throw new Error(`Path "${path} is not a file.`);
        }

        if (response.mimeType) {
            return response.mimeType;
        }

        if (options.disallowFallback) {
            throw new Error('Mime-type not available via HeadObject');
        }

        maybeAbort(options.abortSignal);
        const method = options.fallbackMethod ?? 'path';
        const mimeType = method === 'path'
            ? lookup(path)
            : await this.lookupMimeTypeFromStream(path, options);

        if (mimeType === undefined || mimeType === false) {
            throw new Error('Unable to resolve mime-type');
        }

        return mimeType;
    }

    async visibility(path: string, options: MiscellaneousOptions): Promise<string> {
        maybeAbort(options.abortSignal);
        const response: GetObjectAclOutput = await this.client.send(new GetObjectAclCommand({
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
        }), {
            abortSignal: options.abortSignal,
        });

        const publicRead = response.Grants?.some(grant =>
            grant.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AllUsers'
            && grant.Permission === 'READ'
        ) ?? false;

        return publicRead ? Visibility.PUBLIC : Visibility.PRIVATE;
    }

    async* list(path: string, options: AdapterListOptions): AsyncGenerator<StatEntry, any, unknown> {
        const listing = this.listObjects(path, {
            deep: options.deep,
            includePrefixes: true,
            includeSelf: false,
            abortSignal: options.abortSignal,
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
                        lastModifiedMs: item.LastModified?.getTime(),
                    };
                }
            }
        }
    }

    async * listObjects(
        path: string,
        options: {
            deep: boolean,
            includePrefixes: boolean,
            includeSelf: boolean,
            maxKeys?: number,
            abortSignal?: AbortSignal,
        },
    ): AsyncGenerator<{ type: 'prefix', item: CommonPrefix } | { type: 'object', item: _Object }, any, unknown> {
        maybeAbort(options.abortSignal);
        const prefix = this.prefixer.prefixDirectoryPath(path);
        let collectedKeys = 0;
        let shouldContinue = true;
        let continuationToken: string | undefined = undefined;

        while (shouldContinue && (options.maxKeys === undefined || collectedKeys < options.maxKeys)) {
            maybeAbort(options.abortSignal);
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

                collectedKeys++;
                yield {type: 'prefix', item};
            }

            for (const item of response.Contents ?? []) {
                if ((!options.includeSelf && item.Key === prefix) || item.Key === undefined) {
                    // not interested in itself
                    // not interested in empty prefixes
                    continue;
                }

                collectedKeys++;
                yield {type: 'object', item};
            }
        }
    }

    async read(path: string, options: MiscellaneousOptions): Promise<FileContents> {
        maybeAbort(options.abortSignal);

        let response: GetObjectCommandOutput;

        try {
            response = await this.client.send(new GetObjectCommand({
                Bucket: this.options.bucket,
                Key: this.prefixer.prefixFilePath(path),
            }), {
                abortSignal: options.abortSignal,
            });
        } catch (err) {
            if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) {
                throw FileWasNotFound.atLocation(path, {
                    context: {path, options},
                    cause: err,
                });
            }

            throw err;
        }

        if (response.Body instanceof Readable || response.Body instanceof ReadableStream) {
            return response.Body;
        }

        throw new Error('No response body was provided');
    }

    async stat(path: string, options: MiscellaneousOptions): Promise<StatEntry> {
        maybeAbort(options.abortSignal);
        const response = await this.client.send(new HeadObjectCommand({
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
        }), {
            abortSignal: options.abortSignal,
        });

        return {
            path,
            type: 'file',
            isDirectory: false,
            isFile: true,
            size: response.ContentLength ?? 0,
            lastModifiedMs: response.LastModified?.getTime(),
            mimeType: response.ContentType,
        };
    }

    async createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        const key = this.prefixer.prefixDirectoryPath(path);
        const abortSignal = options.abortSignal;
        const abortController = new AbortController();

        if (abortSignal) {
            if (abortSignal.aborted) {
                throw abortSignal.reason;
            }

            abortSignal.addEventListener('abort', () => {
                abortController.abort(abortSignal.reason);
            });
        }
        const params = this.createPutObjectParams(key, '', {
            ContentLength: 0,
            ACL: options.directoryVisibility ? this.visibilityToAcl(options.directoryVisibility) : undefined,
        });

        maybeAbort(abortSignal);
        await this.client.send(new PutObjectCommand(params), {
            abortSignal,
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

        const writeOptions: PutObjectOptions = {
            ACL: options.visibility ? this.visibilityToAcl(options.visibility) : undefined,
            ContentType: mimeType,
            ContentLength: options.size,
            CacheControl: options.cacheControl,
        }

        for (const option of Object.keys(options)) {
            if (isWriteOptionKey(option)) {
                const resolver = (writeOptionResolvers as any)[option];
                const value = options[option];

                if (resolver(value)) {
                    (writeOptions as any)[option] = value;
                }
            }
        }

        const abortController = new AbortController();

        if (options.abortSignal) {
            const abortSignal = options.abortSignal;
            if (abortSignal.aborted) {
                throw abortSignal.reason;
            }

            abortSignal.addEventListener('abort', () => {
                abortController.abort(abortSignal.reason);
            });
        }

        const upload = new Upload({
            client: this.client,
            params: this.createPutObjectParams(
                this.prefixer.prefixFilePath(path),
                contents,
                writeOptions,
            ),
            abortController,
            ...this.options.uploadConfiguration,
        });

        await upload.done();
    }

    private createPutObjectParams(
        key: string,
        contents: Readable | '',
        options: PutObjectOptions,
    ): PutObjectCommandInput {
        const params: PutObjectCommandInput =  {
            Bucket: this.options.bucket,
            Key: key,
            ...Object.assign({}, this.options.putObjectOptions, options),
        };

        if (contents !== '') {
            params.Body = contents;
        }

        return params;
    }

    async deleteFile(path: string, options: MiscellaneousOptions): Promise<void> {
        maybeAbort(options.abortSignal);
        const key = this.prefixer.prefixFilePath(path);
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
        }), {
            abortSignal: options.abortSignal,
        });
    }

    private visibilityToAcl(visibility: string): ObjectCannedACL {
        if (visibility === Visibility.PUBLIC) {
            return 'public-read';
        } else if (visibility === Visibility.PRIVATE) {
            return 'private';
        }

        throw new Error(`Unrecognized visibility provided; ${visibility}`);
    }

    async changeVisibility(path: string, visibility: string, options: MiscellaneousOptions): Promise<void> {
        maybeAbort(options.abortSignal);
        await this.client.send(new PutObjectAclCommand({
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
            ACL: this.visibilityToAcl(visibility),
        }), {
            abortSignal: options.abortSignal,
        });
    }

    async fileExists(path: string, options: MiscellaneousOptions): Promise<boolean> {
        maybeAbort(options.abortSignal);
        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.options.bucket,
                Key: this.prefixer.prefixFilePath(path),
            }), {
                abortSignal: options.abortSignal,
            });

            return true;
        } catch (e) {
            if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404) {
                return false;
            }

            throw e;
        }
    }

    async directoryExists(path: string, options: MiscellaneousOptions): Promise<boolean> {
        const listing = this.listObjects(path, {
            deep: true,
            includePrefixes: true,
            includeSelf: true,
            maxKeys: 1,
            abortSignal: options.abortSignal,
        });

        for await (const _item of listing) {
            return true;
        }

        return false;
    }

    async publicUrl(path: string, options: PublicUrlOptions): Promise<string> {
        maybeAbort(options.abortSignal);
        return this.publicUrlGenerator.publicUrl(this.prefixer.prefixFilePath(path), {
            bucket: this.options.bucket,
            ...options,
            ...this.options.publicUrlOptions,
        });
    }

    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        maybeAbort(options.abortSignal);
        const algo = (options.algo || this.options.defaultChecksumAlgo || 'SHA256').toUpperCase();

        if (!isSupportedAlgo(algo)) {
            throw ChecksumIsNotAvailable.checksumNotSupported(algo);
        }

        const responseKey = algo === 'ETAG' ? 'ETag' : `Checksum${algo}` as const;

        const response = await this.client.send(new HeadObjectCommand({
            Bucket: this.options.bucket,
            Key: this.prefixer.prefixFilePath(path),
            ...algo === 'ETAG' ? {} : {ChecksumMode: 'ENABLED'},
        }), {
            abortSignal: options.abortSignal,
        });

        const checksum = response[responseKey];

        if (checksum === undefined) {
            throw new Error(`Unable to retrieve checksum with algo ${algo}`);
        }

        return checksum.replace(/^"(.+)"$/, '$1');
    }

    private async lookupMimeTypeFromStream(path: string, options: MimeTypeOptions) {
        const [mimetype, stream] = await resolveMimeType(path, Readable.from(await this.read(path, options)));
        await closeReadable(stream);

        return mimetype;
    }
}

/**
 * BC export
 *
 * @deprecated
 */
export class AwsS3FileStorage extends AwsS3StorageAdapter {}

type ResolversForWriteOptions = {
    [K in keyof WriteOptionsForS3]-?: (value: any) => value is WriteOptionsForS3[K]
}

function isWriteOptionKey(key: string): key is string & keyof ResolversForWriteOptions {
    return Object.hasOwn(writeOptionResolvers, key);
}

export const writeOptionResolvers: ResolversForWriteOptions = {
    ChecksumCRC64NVME: function (value: any): value is PutObjectOptions['ChecksumCRC64NVME'] {
        return typeof value === 'string';
    },
    IfMatch: function (value: any): value is PutObjectOptions['IfMatch'] {
        return typeof value === 'string';
    },
    WriteOffsetBytes: function (value: any): value is PutObjectOptions['WriteOffsetBytes'] {
        return typeof value === 'string';
    },
    ChecksumSHA1: function (value: any): value is PutObjectOptions['ChecksumSHA1'] {
        return typeof value === 'string';
    },
    ChecksumSHA256: function (value: any): value is PutObjectOptions['ChecksumSHA256'] {
        return typeof value === 'string';
    },
    ChecksumCRC32: function (value: any): value is PutObjectOptions['ChecksumCRC32'] {
        return typeof value === 'string';
    },
    ChecksumCRC32C: function (value: any): value is PutObjectOptions['ChecksumCRC32C'] {
        return typeof value === 'string';
    },
    CacheControl: function (value: any): value is PutObjectOptions['CacheControl'] {
        return typeof value === 'string';
    },
    ContentDisposition: function (value: any): value is PutObjectOptions['ContentDisposition'] {
        return typeof value === 'string';
    },
    ContentEncoding: function (value: any): value is PutObjectOptions['ContentEncoding'] {
        return typeof value === 'string';
    },
    ContentLanguage: function (value: any): value is PutObjectOptions['ContentLanguage'] {
        return typeof value === 'string';
    },
    ContentMD5: function (value: any): value is PutObjectOptions['ContentMD5'] {
        return typeof value === 'string';
    },
    ContentType: function (value: any): value is PutObjectOptions['ContentType'] {
        return typeof value === 'string';
    },
    ChecksumAlgorithm: function (value: any): value is PutObjectOptions['ChecksumAlgorithm'] {
        return typeof value === 'string';
    },
    Expires: function (value: any): value is PutObjectOptions['Expires'] {
        return value instanceof Date;
    },
    GrantFullControl: function (value: any): value is PutObjectOptions['GrantFullControl'] {
        return typeof value === 'string';
    },
    GrantRead: function (value: any): value is PutObjectOptions['GrantRead'] {
        return typeof value === 'string';
    },
    GrantReadACP: function (value: any): value is PutObjectOptions['GrantReadACP'] {
        return typeof value === 'string';
    },
    GrantWriteACP: function (value: any): value is PutObjectOptions['GrantWriteACP'] {
        return typeof value === 'string';
    },
    Metadata: function (value: any): value is PutObjectOptions['Metadata'] {
        return typeof value === 'object';
    },
    ServerSideEncryption: function (value: any): value is PutObjectOptions['ServerSideEncryption'] {
        return typeof value === 'string';
    },
    StorageClass: function (value: any): value is PutObjectOptions['StorageClass'] {
        return typeof value === 'string';
    },
    WebsiteRedirectLocation: function (value: any): value is PutObjectOptions['WebsiteRedirectLocation'] {
        return typeof value === 'string';
    },
    SSECustomerAlgorithm: function (value: any): value is PutObjectOptions['SSECustomerAlgorithm'] {
        return typeof value === 'string';
    },
    SSECustomerKey: function (value: any): value is PutObjectOptions['SSECustomerKey'] {
        return typeof value === 'string';
    },
    SSECustomerKeyMD5: function (value: any): value is PutObjectOptions['SSECustomerKeyMD5'] {
        return typeof value === 'string';
    },
    SSEKMSKeyId: function (value: any): value is PutObjectOptions['SSEKMSKeyId'] {
        return typeof value === 'string';
    },
    SSEKMSEncryptionContext: function (value: any): value is PutObjectOptions['SSEKMSEncryptionContext'] {
        return typeof value === 'string';
    },
    BucketKeyEnabled: function (value: any): value is PutObjectOptions['BucketKeyEnabled'] {
        return typeof value === 'string';
    },
    RequestPayer: function (value: any): value is PutObjectOptions['RequestPayer'] {
        return typeof value === 'string';
    },
    Tagging: function (value: any): value is PutObjectOptions['Tagging'] {
        return typeof value === 'string';
    },
    ObjectLockMode: function (value: any): value is PutObjectOptions['ObjectLockMode'] {
        return typeof value === 'string';
    },
    ObjectLockRetainUntilDate: function (value: any): value is PutObjectOptions['ObjectLockRetainUntilDate'] {
        return value instanceof Date;
    },
    ObjectLockLegalHoldStatus: function (value: any): value is PutObjectOptions['ObjectLockLegalHoldStatus'] {
        return typeof value === 'string';
    },
    ExpectedBucketOwner: function (value: any): value is PutObjectOptions['ExpectedBucketOwner'] {
        return typeof value === 'string';
    },
    IfNoneMatch: function (value: any): value is WriteOptionsForS3['IfNoneMatch'] {
        return typeof value === 'string';
    },
};
