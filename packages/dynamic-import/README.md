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

## Setup

```typescript
const {dynamicallyImport} = require('@flystorage/dynamic-import');

async function useFileType() {
    const {fileTypeFromBuffer} = await dynamicallyImport<typeof import('file-type')>('file-type');
}

useFileType();
```

> ⚠️ Always use the FileStorage, it is essential for security and a good developer
> experience. Do not use the adapter directly.
 
## Usage

```typescript

import {TriggeredErrors} from '@flystorage/chaos';

const strategy = new TriggeredErrors();

// error on all write calls
strategy.on('write', () => new Error());

// error on first 2 stat calls
strategy.on('stat', () => new Error(), {times: 2});

// error after first 2 deleteFile calls
strategy.on('deleteFile', () => new Error(), {after: 2});

// error on 2nd and 3rd call to any method
strategy.on('*', () => new Error(), {after: 1, times: 2});
```

