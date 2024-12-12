<img src="https://raw.githubusercontent.com/duna-oss/flystorage/main/flystorage.svg" width="50px" height="50px" />

# Utility for dynamically importing ESM code

The TypeScript compiler turns dynamic import statements into require calls. This breaks importing
ESM packages in CommonJS code.

This utility helps to work around this by provided a JavaScript function to do the actual importing.  

## Installation

Install all the required packages

```bash
npm install --save @flystorage/dynamic-import
```

## Usage

```typescript
const {dynamicallyImport} = require('@flystorage/dynamic-import');

async function useFileType() {
    const {fileTypeFromBuffer} = await dynamicallyImport<typeof import('file-type')>('file-type');
}

useFileType();
```
