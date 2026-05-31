import {defineConfig} from 'tsdown';
import {resolve} from 'path';
import {readdir, readFile} from 'fs/promises';

const packageDirectories: string[] = Array.from(
    (await readdir(resolve(import.meta.dirname, 'packages'), {withFileTypes: true}))
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(directory => !directory.endsWith('-tests') && directory !== 'dynamic-import'),
);

const aliases: Record<string, string> = {};
const sources: Record<string, string[]> = {};

await Promise.all(packageDirectories.map(async name => {
    const packageFile = JSON.parse(await readFile(resolve(import.meta.dirname, 'packages', name, 'package.json'), 'utf8'));
    const exportDeclarations = packageFile['exports'] ?? {};
    const sourceFiles: string[] = [];

    for (const key in exportDeclarations) {
        if (key === './package.json') {
            continue;
        }

        console.log(exportDeclarations[key]);
        const sourceFile = exportDeclarations[key]['import']['default'].replace('dist', 'src').replace('.mjs', '.ts');
        sourceFiles.push(sourceFile);
        const destination = resolve(import.meta.dirname, 'packages', name, sourceFile);

        if (key === '.') {
            aliases[`@flystorage/${name}`] = destination;
        } else if (key.startsWith('./')) {
            aliases[`@flystorage/${name}/${key.substring(2)}`] = destination;
        }
    }

    sources[name] = sourceFiles.map(file => `packages/${name}/${file}`);
}));

export default defineConfig(
    packageDirectories.map(dirname => {
        return {
            dts: true,
            format: ['esm', 'cjs'] as any,
            alias: aliases,
            deps: {
                skipNodeModulesBundle: true,
                neverBundle: /^@flystorage\//,
            },
            entry: sources[dirname] ?? [],
            outDir: resolve(import.meta.dirname, `packages/${dirname}/dist`),
            platform: 'node',
            unbundle: false,
        } as const;
    }),
);