import {Readable} from 'stream';
import {readableToBuffer} from './file-storage.js';

describe('utilities', () => {
    describe('readableToBuffer', () => {
        test('converting to and from a buffer', async () => {
            const input = Buffer.from('buffer contents');
            const inputReadable = Readable.from(input);

            const output = await readableToBuffer(inputReadable);

            expect(output.toString()).toEqual(input.toString());
        })
    })
});