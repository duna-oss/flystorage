import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {concurrently} from 'concurrently';

const directories = (await readdir(path.resolve(process.cwd(), 'packages'), {
    withFileTypes: true,
}))
    .filter(item => item.isDirectory())
    .map(dir => path.parse(dir.name).name);

const commands = directories.map(directory => ({
    name: directory,
    command: `npm run watch -w ./packages/${directory} --if-present`
}));

console.log('starting', commands);
concurrently(commands);