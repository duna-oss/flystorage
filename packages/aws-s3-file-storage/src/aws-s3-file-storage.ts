import {PutObjectCommandInput, S3Client, DeleteObjectCommand} from '@aws-sdk/client-s3';
import {Configuration, Upload} from '@aws-sdk/lib-storage';
import {PathPrefixer, StorageAdapter, WriteOptions} from '@flystorage/file-storage';
import {Readable} from 'stream';

export type AwsS3FileStorageOptions = Readonly<{
    bucket: string,
    prefix?: string,
    putObjectOptions?: Omit<PutObjectCommandInput, 'Bucket' | 'Key'>
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

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        const key = this.prefixer.prefixFilePath(path);
        const params: PutObjectCommandInput = {
            Bucket: this.options.bucket,
            Key: key,
            Body: contents,
            ...this.options.putObjectOptions,
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
}