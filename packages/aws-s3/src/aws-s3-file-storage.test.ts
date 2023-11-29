import {S3Client} from '@aws-sdk/client-s3';
import {FileStorage, readableToString, Visibility} from '@flystorage/file-storage';
import * as https from 'https';
import {AwsS3FileStorage} from './aws-s3-file-storage.js';

describe('aws-s3 file storage', () => {
    const client = new S3Client();
    let storage: FileStorage;

    const truncate = async () =>
        await (new FileStorage(new AwsS3FileStorage(client, {
            bucket: 'flysystem-check',
            prefix: 'storage',
        }))).deleteDirectory('tests');

    beforeEach(async () => {
        await truncate();
        storage = new FileStorage(new AwsS3FileStorage(client, {
            bucket: 'flysystem-check',
            prefix: 'storage/tests',
        }));
    });

    afterEach(async () => {
        await truncate();
    });

    test('writing and reading a file', async () => {
        await storage.write('path.txt', 'this is the contents');

        expect(await storage.readToString('path.txt')).toEqual('this is the contents');
    });

    test('you can download public files', async () => {
        await storage.write('path.txt', 'contents of the public file', {
            visibility: Visibility.PUBLIC,
        });

        const url = await storage.publicUrl('path.txt');
        const contents = await naivelyDownloadFile(url);

        expect(contents).toEqual('contents of the public file');
    });
});

function naivelyDownloadFile(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, async res => {
            if (res.statusCode !== 200) {
                reject(new Error(`Not able to download the file from ${url}, response status [${res.statusCode}]`));
            } else {
                resolve(await readableToString(res));
            }
        });
    });
}