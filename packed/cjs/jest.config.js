const esModules = ["@flystorage/dynamic-import"];

module.exports = {
    transformIgnorePatterns: [`/node_modules/(?!(${esModules.join("|")})/)`,],
};