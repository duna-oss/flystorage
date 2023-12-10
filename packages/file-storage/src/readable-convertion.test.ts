import {Readable} from "node:stream";
import {readableToString} from "./file-storage.js";

describe('converting readables', () => {
    test('converting a stream to a string', async () => {
        expect(true).toEqual(true);
        const readable = Readable.from('something');

        const result = await readableToString(readable);

        expect(result).toEqual('something');
    });
});