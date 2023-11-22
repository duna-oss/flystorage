import {PutObjectCommandInput, S3Client, DeleteObjectCommand, ObjectCannedACL} from '@aws-sdk/client-s3';
import {Configuration, Upload} from '@aws-sdk/lib-storage';
import {
    CreateDirectoryOptions,
    PathPrefixer,
    StorageAdapter, Visibility,
    WriteOptions
} from '@flystorage/file-storage';
import {Readable} from 'stream';
import {resolveMimeType} from './stream-mime-type.js';

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
}