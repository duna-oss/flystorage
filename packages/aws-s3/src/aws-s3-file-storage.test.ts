import {S3Client} from '@aws-sdk/client-s3';
import {FileStorage, readableToString, Visibility, closeReadable} from '@flystorage/file-storage';
import {BinaryToTextEncoding, createHash, randomBytes} from 'crypto';
import * as https from 'https';
import {AwsS3StorageAdapter} from './aws-s3-storage-adapter.js';
import {createReadStream} from "node:fs";
import * as path from "node:path";

let client: S3Client;
let storage: FileStorage;
const testSegment = randomBytes(10).toString('hex');

describe('aws-s3 file storage', () => {
    const truncate = async () =>
        await new FileStorage(new AwsS3StorageAdapter(client, {
            bucket: 'flysystem-check',
            prefix: 'storage',
        })).deleteDirectory(testSegment);

    beforeAll(() => {
        client = new S3Client();
    });

    beforeEach(async () => {
        const secondSegment = randomBytes(10).toString('hex');
        storage = new FileStorage(new AwsS3StorageAdapter(client, {
            bucket: 'flysystem-check',
            prefix: `storage/${testSegment}/${secondSegment}`,
        }));
    });

    afterAll(async () => {
        await truncate();
        client.destroy();
    });

    test('writing and reading a file', async () => {
        await storage.write('path.txt', 'this is the contents');

        expect(await storage.readToString('path.txt')).toEqual('this is the contents');
    });

    test('moving a file', async () => {
        await storage.write('from.txt', 'this');

        await storage.moveFile('from.txt', 'to.txt');

        expect(await storage.fileExists('from.txt')).toEqual(false);
        expect(await storage.readToString('to.txt')).toEqual('this');
    });

    test('copying a file', async () => {
        await storage.write('from.txt', 'this');

        await storage.copyFile('from.txt', 'to.txt');

        expect(await storage.fileExists('from.txt')).toEqual(true);
        expect(await storage.readToString('to.txt')).toEqual('this');
    });

    test('trying to copy a file that does not exist', async () => {
        expect(storage.copyFile('404.txt', 'to.txt')).rejects.toThrow();
    });

    test('trying to move a file that does not exist', async () => {
        expect(storage.moveFile('404.txt', 'to.txt')).rejects.toThrow();
    });

    test('you can download public files using a public URL', async () => {
        await storage.write('public.txt', 'contents of the public file', {
            visibility: Visibility.PUBLIC,
        });

        const url = await storage.publicUrl('public.txt');
        const contents = await naivelyDownloadFile(url);

        expect(contents).toEqual('contents of the public file');
    });

    test('private files can only be downloaded using a temporary URL', async () => {
        await storage.write('private.txt', 'contents of the private file', {
            visibility: Visibility.PRIVATE,
        });

        await expect(naivelyDownloadFile(await storage.publicUrl('private.txt'))).rejects.toThrow();

        await expect(naivelyDownloadFile(
            await storage.temporaryUrl('private.txt', {expiresAt: Date.now() + 60 * 1000})
        )).resolves.toEqual('contents of the private file');
    });

    test('retrieving the size of a file', async () => {
        const contents = 'this is the contents of the file';
        await storage.write('something.txt', contents);

        expect(await storage.fileSize('something.txt')).toEqual(contents.length);
    });

    test('writing a png and fetching its mime-type', async () => {
        const handle = createReadStream(path.resolve(process.cwd(), 'fixtures/screenshot.png'));
        await storage.write('image.png', handle);
        closeReadable(handle);

        const mimeType = await storage.mimeType('image.png');

        expect(mimeType).toEqual('image/png');
    });

    test('fetching the last modified', async () => {
        await storage.write('test.txt', 'contents');

        const lastModified = await storage.lastModified('test.txt');

        expect(lastModified).toBeGreaterThan(Date.now() - 5000);
        expect(lastModified).toBeLessThan(Date.now() + 5000);
    })

    test('it can request checksums', async () => {
        function hashString(input: string, algo: string, encoding: BinaryToTextEncoding = 'hex'): string {
            return createHash(algo).update(input).digest(encoding);
        }

        const contents = 'this is for the checksum';
        await storage.write('path.txt', contents);
        const expectedChecksum = hashString(contents, 'md5');

        const checksum = await storage.checksum('path.txt', {
            algo: 'etag',
        });

        expect(checksum).toEqual(expectedChecksum);
    });

    test('it handles custom Cache-Control header', async() => {
        await storage.write('cache.txt', 'some content', {cacheControl: "max-age=7200, public", visibility: Visibility.PUBLIC});
        const url = await storage.publicUrl('cache.txt')
        const res = await fetch(url);
        expect(res.headers.get("Cache-Control")).toEqual("max-age=7200, public")
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