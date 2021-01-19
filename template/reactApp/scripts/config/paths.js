'use strict';

const path = require('path');
const fs = require('fs');
const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');

// Make sure any symlinks in the project folder are resolved:
// https://github.com/facebook/create-react-app/issues/637
const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (...relativePath) => path.resolve(appDirectory, ...relativePath);

const pkg = require(resolveApp('package.json'));

// We use `PUBLIC_URL` environment variable or "homepage" field to infer
// "public path" at which the app is served.
// webpack needs to know it to put the right <script> hrefs into HTML even in
// single-page apps that may serve index.html for nested URLs like /todos/42.
// We can't use a relative path in HTML because we don't want to load something
// like /todos/42/static/js/bundle.7289d.js. We have to know the root.
const isEnvDevelopment = process.env.NODE_ENV === 'development' && process.env.WEBPACK_BUILDING !== 'true'
const homepage = pkg.homepage || (pkg.noRewrite ? '.' : undefined)
const envPublicUrl = process.env.PUBLIC_URL ||
    (process.env.NODE_ENV === 'production' && process.env.SKIP_CDN !== 'true' && pkg.cdn
        ? pkg.cdn.host + pkg.cdn.path
        : process.env.BASE_NAME)

const publicUrlOrPath = getPublicUrlOrPath(isEnvDevelopment, homepage, envPublicUrl);

const moduleFileExtensions = ['mjs', 'js', 'ts', 'tsx', 'jsx'];
const webModuleFileExtensions = moduleFileExtensions.map(ext => `web.${ext}`).concat(moduleFileExtensions, 'json');
// ['web.mjs', 'web.js', 'web.ts', 'web.tsx', 'web.jsx', 'mjs', 'js', 'ts', 'tsx', 'jsx', 'json']


// Resolve file paths in the same order as webpack
const resolveModule = (resolveFn, filePath) => {
    const extension = moduleFileExtensions.find(extension =>
        fs.existsSync(resolveFn(`${filePath}.${extension}`))
    );

    if (extension) {
        return resolveFn(`${filePath}.${extension}`);
    }

    return resolveFn(`${filePath}.js`);
};


const moduleAlias = Object.assign(
    glob.sync(`${resolveApp('app/*')}/`).reduce((alias, file) => { // ! 自动处理app下的一级目录别名
        alias[path.basename(file)] = path.resolve(file);

        return alias;
    }, {}),
    lodash.mapValues(pkg.alias, function(relativePath) { // ! 处理pkg中配置的别名
        if (fs.pathExistsSync(resolveApp(relativePath))) {
            return resolveApp(relativePath);
        }

        return relativePath;
    })
);

// ! 得到 jsEntries htmlEntries 对象
const jsEntries = {};
const htmlEntries = {};

glob.sync(resolveApp('app/!(_)*.{j,t}s?(x)')).forEach(function(file) {
    const basename = path.basename(file).replace(/(\.web)?\.[jt]sx?$/, '');
    jsEntries[basename] = file;
});

glob.sync(resolveApp('public/!(_)*.html')).forEach(function(file) {
    const basename = path.basename(file).replace(/(\.web)?\.html$/, '');
    htmlEntries[basename] = file;
});



module.exports = {
    dotenv: resolveApp('.env'),
    appPath: resolveApp('.'),
    appBuild: resolveApp(process.env.BUILD_DIR || 'build'),
    appPublic: resolveApp('public'),
    appHtml: htmlEntries.index || Object.values(htmlEntries)[0],
    appIndexJs: jsEntries.index || Object.values(jsEntries)[0],
    appPackageJson: resolveApp('package.json'),
    // appSrc: resolveApp('src'),
    appSrc: resolveApp('app'),
    appTsConfig: resolveApp('tsconfig.json'),
    appJsConfig: resolveApp('jsconfig.json'),
    yarnLockFile: resolveApp('yarn.lock'),
    // proxySetup: resolveApp('src/setupProxy.js'),
    appNodeModules: resolveApp('node_modules'),
    // swSrc: resolveModule(resolveApp, 'src/service-worker'),
    publicUrlOrPath,
    moduleFileExtensions,
    moduleAlias,
    // js entry
    jsEntries,
    // html entry
    htmlEntries,
};

