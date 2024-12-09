async function dynamicallyImport(path) {
    return await import(path);
};

exports.dynamicallyImport = dynamicallyImport;