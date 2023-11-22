import * as fs from 'node:fs';
import path from 'node:path';

import { dirname } from 'path';
import {Readable} from 'stream';
import { fileURLToPath } from 'url';
import {resolveMimeType} from './stream-mime-type.js';

const dir = dirname(fileURLToPath(import.meta.url));

describe('resolveMimeType', () => {
    let stream: Readable;
    let mime: string | undefined;

    afterEach(() => {
        stream?.closed === false && stream.destroy();
        mime = undefined;
    });

    test('resolving the mime-type of a file', async () => {
        stream = fs.createReadStream(path.resolve(dir, 'fixtures/screenshot.png'));

        [mime, stream] = await resolveMimeType('screenshot.png', stream);

        expect(mime).toEqual('image/png');

        stream.closed || stream.destroy();
    });

    test('when no mime-type can be resolved, use an extension based lookup', async () => {
        stream = Readable.from(Buffer.from(''));

        [mime, stream] = await resolveMimeType('screenshot.jpg', stream);

        expect(mime).toEqual('image/jpeg');
    });

    test('when no mime-type can be resolved, the fallback is used', async () => {
        stream = Readable.from(Buffer.from(''));

        [mime, stream] = await resolveMimeType('screenshot.unkown', stream, 'application/this-is-not-known');

        expect(mime).toEqual('application/this-is-not-known');

        stream.closed || stream.destroy();
    });
});