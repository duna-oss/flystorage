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
        await storage.write('path+name.txt', 'this is the contents');

        expect(await storage.readToString('path+name.txt')).toEqual('this is the contents');
    });

    test('non deep and deep listing should have consistent and similar results', async () => {
        await storage.write('file_1.txt', 'contents');
        await storage.write('file_2.txt', 'contents');
        await storage.createDirectory('directory_1');
        await storage.createDirectory('directory_2');

        const non_deep_listing = await storage.list('/', {deep: false}).toArray();
        const deep_listing = await storage.list('/', {deep: true}).toArray();

        expect(non_deep_listing).toHaveLength(4);
        expect(deep_listing).toHaveLength(4);
        expect(non_deep_listing).toEqual(deep_listing);
    });

    test('moving a file', async () => {
        await storage.write('from+here.txt', 'this');

        await storage.moveFile('from+here.txt', 'to+there.txt');

        expect(await storage.fileExists('from+here.txt')).toEqual(false);
        expect(await storage.readToString('to+there.txt')).toEqual('this');
    });

    test('copying a file', async () => {
        await storage.write('from+this.txt', 'this');

        await storage.copyFile('from+this.txt', 'to+that.txt');

        expect(await storage.fileExists('from+this.txt')).toEqual(true);
        expect(await storage.readToString('to+that.txt')).toEqual('this');
    });

    test('trying to copy a file that does not exist', async () => {
        expect(storage.copyFile('404.txt', 'to.txt')).rejects.toThrow();
    });

    test('trying to move a file that does not exist', async () => {
        expect(storage.moveFile('404.txt', 'to.txt')).rejects.toThrow();
    });

    test('you can download public files using a public URL', async () => {
        await storage.write('public+file.txt', 'contents of the public file', {
            visibility: Visibility.PUBLIC,
        });

        const url = await storage.publicUrl('public+file.txt');
        const contents = await naivelyDownloadFile(url);

        expect(contents).toEqual('contents of the public file');
    });

    test('private files can only be downloaded using a temporary URL', async () => {
        await storage.write('private+file.txt', 'contents of the private file', {
            visibility: Visibility.PRIVATE,
        });

        await expect(naivelyDownloadFile(await storage.publicUrl('private+file.txt'))).rejects.toThrow();

        await expect(naivelyDownloadFile(
            await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000})
        )).resolves.toEqual('contents of the private file');
    });

    describe('response headers', () => {
        test('fetches file with Content-Disposition header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Content-Disposition': 'attachment; filename="private+file.txt"'} }),
                'Content-Disposition'
            )).resolves.toEqual('attachment; filename="private+file.txt"');
        });

        test('fetches file without Content-Disposition header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Content-Disposition'
            )).resolves.toBeUndefined();
        });

        test('fetches file with Cache-Control header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Cache-Control': 'none'} }),
                'Cache-Control'
            )).resolves.toEqual('none');
        });

        test('fetches file without Cache-Control header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Cache-Control'
            )).resolves.toBeUndefined();
        });

        test('fetches file with Content-Encoding header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Content-Encoding': 'br'} }),
                'Content-Encoding'
            )).resolves.toEqual('br');
        });

        test('fetches file without Content-Encoding header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Content-Encoding'
            )).resolves.toBeUndefined();
        });

        test('fetches file with Content-Language header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Content-Language': 'en-US'} }),
                'Content-Language'
            )).resolves.toEqual('en-US');
        });

        test('fetches file without Content-Language header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Content-Language'
            )).resolves.toBeUndefined();
        });

        test('fetches file with Content-Type header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Content-Type': 'image/jpeg'} }),
                'Content-Type'
            )).resolves.toEqual('en-US');
        });

        test('fetches file with Expires header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Expires': 'Sat, 21 Oct 2023 07:28:00 GMT'} }),
                'Expires'
            )).resolves.toEqual('Sat, 21 Oct 2023 07:28:00 GMT');
        });

        test('fetches file without Expires header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Expires'
            )).resolves.toBeUndefined();
        });
    });

    test('retrieving the size of a file', async () => {
        const contents = 'this is the contents of the file';
        await storage.write('something+file.txt', contents);

        expect(await storage.fileSize('something+file.txt')).toEqual(contents.length);
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

function responseHeaderValue(url: string, header: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`Not able to download the file from ${url}, response status [${res.statusCode}]`));
            } else {
                console.log(res.headers);
                resolve(
                    res.headers[header]?.toString()
                        ?? res.headers[header.toLowerCase()]?.toString()
                        ?? undefined
                );
            }
        });
    });
}