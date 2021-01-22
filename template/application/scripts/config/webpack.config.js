const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const resolve = require('resolve');
// const PnpWebpackPlugin = require('pnp-webpack-plugin'); // todo
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const safePostCssParser = require('postcss-safe-parser');
// const ManifestPlugin = require('webpack-manifest-plugin');
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const WatchMissingNodeModulesPlugin = require('react-dev-utils/WatchMissingNodeModulesPlugin');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin'); // todo
const getCSSModuleLocalIdent = require('react-dev-utils/getCSSModuleLocalIdent');
const DirectoryNamedWebpackPlugin = require('directory-named-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin'); // todo
const ImageminPlugin = require('imagemin-webpack-plugin').default;
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin = require('react-dev-utils/ForkTsCheckerWebpackPlugin');
const typescriptFormatter = require('react-dev-utils/typescriptFormatter');

const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const webpackDevClientEntry = require.resolve(
    'react-dev-utils/webpackHotDevClient'
);
const reactRefreshOverlayEntry = require.resolve(
    'react-dev-utils/refreshOverlayInterop'
);

const postcssNormalize = require('postcss-normalize'); // todo
const htmlAttrsOptions = require('./htmlAttrsOptions');
const paths = require('./paths');
const getClientEnvironment = require('./env');

const pkg = require(paths.appPackageJson);

// Some apps do not need the benefits of saving a web request, so not inlining the chunk
// makes for a smoother build process.
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false'; // todo

// todo
const imageInlineSizeLimit = parseInt(
    process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

// Check if TypeScript is setup
const useTypeScript = fs.existsSync(paths.appTsConfig);

// Get the path to the uncompiled service worker (if it exists).
const swSrc = paths.swSrc; // todo

// const isBuilding = process.env.WEBPACK_BUILDING === 'true'; // ! 很奇怪，从来没有见设置过这个变量，为什么在配置的这里又这么重要
// const shouldUseRelativeAssetPath = !paths.publicUrlOrPath.startsWith('http');

// style files regexes
const cssRegex = /\.css$/;
// const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
// const sassModuleRegex = /\.module\.(scss|sass)$/;
const lessRegex = /\.less$/;

const hasJsxRuntime = (() => {
    // https://zhuanlan.zhihu.com/p/313040458
    // 检测是否使用react17的全新JSX转换
    if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
        return false;
    }

    try {
        require.resolve('react/jsx-runtime');

        return true;
    } catch (e) {
        return false;
    }
})();

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function(webpackEnv) {
    const isEnvDevelopment = webpackEnv === 'development';
    const isEnvProduction = webpackEnv === 'production';

    // Variable used for enabling profiling in Production
    // passed into alias object. Uses a flag if passed into the build command
    const isEnvProductionProfile =
        isEnvProduction && process.argv.includes('--profile');

    // Source maps are resource heavy and can cause out of memory issue for large source files.
    const shouldUseSourceMap = isEnvProduction
        ? process.env.GENERATE_SOURCEMAP === 'true'
        : process.env.GENERATE_SOURCEMAP !== 'false';

    const shouldUseSW = process.env.GENERATE_SW === 'true' || !!pkg.pwa;

    // const isEnvNode = paths.useNodeEnv && executionEnv === 'node';
    // const isEnvWeb = !isEnvNode;

    // We will provide `paths.publicUrlOrPath` to our app
    // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
    // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
    // Get environment variables to inject into our app.
    const env = getClientEnvironment({
        PUBLIC_URL: paths.publicUrlOrPath.slice(0, -1),
        ENABLE_PWA: shouldUseSW
    });

    const shouldUseReactRefresh = env.raw.FAST_REFRESH;

    const babelOption = {
        babelrc: false,
        configFile: false,
        compact: false,
        presets: [[require.resolve('babel-preset-react-app/dependencies'), { helpers: true }]],
        cacheDirectory: true,
        cacheCompression: false,
        sourceMaps: shouldUseSourceMap,
        inputSourceMap: shouldUseSourceMap
    };

    // common function to get style loaders
    const getStyleLoaders = (cssOptions, preProcessor) => {
        const loaders = [
            isEnvDevelopment && require.resolve('style-loader'),
            // MiniCssExtractPlugin不支持HMR，因此只推荐在生产环境打包使用，来替代 style-loader
            isEnvProduction && {
                loader: MiniCssExtractPlugin.loader,
                // css is located in `static/css`, use '../../' to locate index.html folder
                // in production `paths.publicUrlOrPath` can be a relative path
                options: paths.publicUrlOrPath.startsWith('.')
                    ? { publicPath: '../../', esModule: true }
                    : { esModule: true },
            },
            {
                loader: require.resolve('css-loader'),
                // options: { sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment, ...cssOptions },
                options: Object.assign({ sourceMap: shouldUseSourceMap }, cssOptions)
            },
            {
                // Options for PostCSS as we reference these options twice
                // Adds vendor prefixing based on your specified browser support in
                // package.json
                loader: require.resolve('postcss-loader'),
                options: {
                    // Necessary for external CSS imports to work
                    // https://github.com/facebook/create-react-app/issues/2677
                    ident: 'postcss',
                    plugins: () => [
                        require('postcss-flexbugs-fixes'),
                        require('postcss-preset-env')({
                            autoprefixer: {
                                flexbox: 'no-2009',
                            },
                            stage: 3,
                        }),
                        // Adds PostCSS Normalize as the reset css with default options,
                        // so that it honors browserslist config in package.json
                        // which in turn let's users customize the target behavior as per their needs.
                        postcssNormalize(),
                    ],
                    sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                },
            },
        ].filter(Boolean);

        if (preProcessor) {
            const partOptions =
                preProcessor === 'less-loader' ?
                    {
                        lessOptions: {
                            javascriptEnabled: true // 支持Less中编写js函数
                        }
                    } : {
                        implementation: require('sass')
                    }

            loaders.push(
                {
                    loader: require.resolve('resolve-url-loader'), // 处理相对路径引用
                    options: {
                        sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                        root: paths.appSrc,
                    },
                },
                {
                    loader: require.resolve(preProcessor),
                    options: {
                        sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
                        ...partOptions
                    }
                }
            );
        }

        return loaders;
    };

    // 多页面模板分离支持
    const getMultiHtmlInjects = () => {
        // eslint-disable-next-line
        const matchScriptStylePattern = /<\!--\s*script:\s*([\w]+)(?:\.[jt]sx?)?\s*-->/g;
        const htmlInjects = [];

        Object.keys(paths.htmlEntries).forEach(function(name) {
            const chunks = ['_vendor_'];
            const template = paths.htmlEntries[name];

            if (paths.jsEntries[name]) {
                chunks.push(name);
            }

            const contents = fs.readFileSync(template);
            let matches;

            while ((matches = matchScriptStylePattern.exec(contents))) {
                chunks.push(matches[1]);
            }

            const createHtmlPlugin = function(filename, template) {
                return new HtmlWebpackPlugin(
                    Object.assign(
                        {
                            chunks,
                            filename,
                            template,
                            inject: true,
                            chunksSortMode: 'manual'
                        },
                        isEnvProduction
                            ? {
                                minify: {
                                    ignoreCustomComments: [/^\s+(your\shtml|root)\s+$/],
                                    removeComments: true,
                                    collapseWhitespace: true,
                                    removeRedundantAttributes: true,
                                    useShortDoctype: true,
                                    removeEmptyAttributes: true,
                                    removeStyleLinkTypeAttributes: true,
                                    keepClosingSlash: true,
                                    minifyJS: true,
                                    minifyCSS: true,
                                    minifyURLs: true
                                }
                            }
                            : undefined
                    )
                );
            };

            htmlInjects.push(createHtmlPlugin(`${name}.html`, template));
        });

        return htmlInjects;
    }

    return {
        name: 'aura',
        mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
        // Stop compilation early in production
        bail: isEnvProduction,
        devtool: shouldUseSourceMap
            ? isEnvProduction
                ? 'hidden-source-map'
                : 'cheap-module-source-map'
            : false,
        // These are the "entry points" to our application.
        // This means they will be the "root" imports that are included in JS bundle.
        entry: Object.assign(
            {
                _vendor_: [
                    require.resolve('./polyfills'),
                    // isEnvDevelopment && require.resolve('react-dev-utils/webpackHotDevClient'),
                    // isEnvDevelopment && 'react-hot-loader/patch'
                ].concat(pkg.vendor || []).filter(Boolean)
            },
            paths.jsEntries
        ),
        // target: 'web', // 构建目标 'web' 或 'node'，默认是 'web' 可省略
        output: {
            // The build folder.
            path: isEnvProduction ? paths.appBuild : paths.appBuild, // ! dev时设为undefined，猜测是因为热更新时直接输出到内存中了
            // Add /* filename */ comments to generated require()s in the output.
            pathinfo: isEnvDevelopment,
            // There will be one main bundle, and one file per asynchronous chunk.
            // In development, it does not produce real files.
            filename: isEnvProduction
                ? 'static/js/[name].[contenthash:8].bundle.js'
                : isEnvDevelopment && 'static/js/[name].[hash:8].bundle.js',
            // TODO: remove this when upgrading to webpack 5，https://webpack.docschina.org/configuration/output/#outputfutureemitassets
            futureEmitAssets: true,
            // There are also additional JS chunk files if you use code splitting.
            chunkFilename: isEnvProduction
                ? 'static/js/[name].[contenthash:8].chunk.js'
                : isEnvDevelopment && 'static/js/[name].[hash:8].chunk.js',
            // webpack uses `publicPath` to determine where the app is being served from.
            // It requires a trailing slash, or the file assets will get an incorrect path.
            // We inferred the "public path" (such as / or /my-project) from homepage.
            publicPath: paths.publicUrlOrPath,
            // Point sourcemap entries to original disk location (format as URL on Windows)
            devtoolModuleFilenameTemplate: isEnvProduction
                ? info => path.relative(paths.appSrc, info.absoluteResourcePath).replace(/\\/g, '/')
                : isEnvDevelopment && (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
            // Prevents conflicts when multiple webpack runtimes (from different apps)
            // are used on the same page.
            jsonpFunction: `webpackJsonp${pkg.name}`,
            // this defaults to 'window', but by setting it to 'this' then
            // module chunks which are built will work in web workers as well.
            globalObject: 'this',
        },
        optimization: {
            minimize: isEnvProduction,
            minimizer: [
                // This is only used in production mode
                new TerserPlugin({
                    terserOptions: {
                        parse: {
                            // We want terser to parse ecma 8 code. However, we don't want it
                            // to apply any minification steps that turns valid ecma 5 code
                            // into invalid ecma 5 code. This is why the 'compress' and 'output'
                            // sections only apply transformations that are ecma 5 safe
                            // https://github.com/facebook/create-react-app/pull/4234
                            ecma: 8,
                        },
                        compress: {
                            ecma: 5,
                            warnings: false,
                            // Disabled because of an issue with Uglify breaking seemingly valid code:
                            // https://github.com/facebook/create-react-app/issues/2376
                            // Pending further investigation:
                            // https://github.com/mishoo/UglifyJS2/issues/2011
                            comparisons: false,
                            // Disabled because of an issue with Terser breaking valid code:
                            // https://github.com/facebook/create-react-app/issues/5250
                            // Pending further investigation:
                            // https://github.com/terser-js/terser/issues/120
                            inline: 2,
                        },
                        mangle: {
                            safari10: true,
                        },
                        // Added for profiling in devtools
                        keep_classnames: isEnvProductionProfile,
                        keep_fnames: isEnvProductionProfile,
                        output: {
                            ecma: 5,
                            comments: /@(license|author)/i,
                            // Turned on because emoji and regex is not minified properly using default
                            // https://github.com/facebook/create-react-app/issues/2488
                            ascii_only: true,
                        },
                    },
                    parallel: true, // Use multi-process parallel running to improve the build speed. Default number of concurrent runs: os.cpus().length - 1
                    cache: true, // Enable file caching. Default path to cache directory: node_modules/.cache/terser-webpack-plugin
                    sourceMap: shouldUseSourceMap,
                }),
                // This is only used in production mode
                new OptimizeCSSAssetsPlugin({
                    cssProcessorOptions: {
                        parser: safePostCssParser,
                        map: shouldUseSourceMap
                            ? {
                                // `inline: false` forces the sourcemap to be output into a separate file
                                inline: false,
                                // `annotation: true` appends the sourceMappingURL to the end of
                                // the css file, helping the browser find the sourcemap
                                annotation: isEnvDevelopment,
                            }
                            : false,
                    },
                    cssProcessorPluginOptions: {
                        preset: ['default', { minifyFontValues: { removeQuotes: false } }],
                    },
                }),
            ],
            // Automatically split vendor and commons
            // https://webpack.docschina.org/plugins/split-chunks-plugin/
            splitChunks: {
                chunks: 'async',
                name: false,
                cacheGroups: {
                    vendors: {
                        priority: 10,
                        chunks: 'all',
                        test: '_vendor_',
                        name: 'vendor',
                        reuseExistingChunk: true
                    },
                }
            },
            // Keep the runtime chunk separated to enable long term caching
            // https://twitter.com/wSokra/status/969679223278505985
            // https://github.com/facebook/create-react-app/issues/5358
            runtimeChunk: {
                name: entrypoint => `runtime-${entrypoint.name}`,
            },
            // runtimeChunk: 'single'
        },
        resolve: {
            // This allows you to set a fallback for where webpack should look for modules.
            // We placed these paths second because we want `node_modules` to "win"
            // if there are any conflicts. This matches Node resolution mechanism.
            // https://github.com/facebook/create-react-app/issues/253
            modules: ['node_modules', paths.appNodeModules],
            // These are the reasonable defaults supported by the Node ecosystem.
            // We also include JSX as a common component filename extension to support
            // some tools, although we do not recommend using it, see:
            // https://github.com/facebook/create-react-app/issues/290
            // `web` extension prefixes have been added for better support
            // for React Native Web.
            extensions: paths.moduleFileExtensions
                .map(ext => `.${ext}`),
            alias: {
                // Support React Native Web
                // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
                'react-native': 'react-native-web',
                // Allows for better profiling with ReactDevTools
                ...(isEnvProductionProfile && {
                    'react-dom$': 'react-dom/profiling',
                    'scheduler/tracing': 'scheduler/tracing-profiling',
                }),
                ...paths.moduleAlias
            },
            plugins: [
                // https://www.npmjs.com/package/directory-named-webpack-plugin
                new DirectoryNamedWebpackPlugin({
                    honorIndex: true, //  index file, e.g. index.js, it should be used as entry file
                    exclude: /node_modules|libs/
                }),
                // Adds support for installing with Plug'n'Play, leading to faster installs and adding
                // guards against forgotten dependencies and such.
                // PnpWebpackPlugin, // !
                // Prevents users from importing files from outside of src/ (or node_modules/).
                // This often causes confusion because we only process files within src/ with babel.
                // To fix this, we prevent you from importing files out of src/ -- if you'd like to,
                // please link the files into your node_modules/ and let module-resolution kick in.
                // Make sure your source files are compiled, as they will not be processed in any way.
                new ModuleScopePlugin(paths.appSrc, [
                    paths.pkg,
                    reactRefreshOverlayEntry,
                ]),
            ],
        },
        // // 仅用于解析 webpack 的 loader 包
        // resolveLoader: {
        //     plugins: [
        //         // Also related to Plug'n'Play, but this time it tells webpack to load its loaders
        //         // from the current package.
        //         PnpWebpackPlugin.moduleLoader(module),
        //     ],
        // },
        module: {
            strictExportPresence: true, // makes missing exports an error instead of warning
            rules: [
                // Disable require.ensure as it's not a standard language feature.
                { parser: { requireEnsure: false } },
                // {
                //     test: /\.(js|mjs|jsx|ts|tsx)$/,
                //     enforce: 'pre',
                //     use: [
                //         {
                //             options: {
                //                 cache: true,
                //                 formatter: require.resolve('react-dev-utils/eslintFormatter'),
                //                 eslintPath: require.resolve('eslint'),
                //                 resolvePluginsRelativeTo: __dirname
                //             },
                //             loader: require.resolve('eslint-loader')
                //         }
                //     ],
                //     include: paths.appSrc
                // },
                {
                    // "oneOf" will traverse all following loaders until one will
                    // match the requirements. When no loader matches it will fall
                    // back to the "file" loader at the end of the loader list.
                    oneOf: [
                        // TODO: Merge this config once `image/avif` is in the mime-db
                        // https://github.com/jshttp/mime-db
                        {
                            test: [/\.avif$/],
                            loader: require.resolve('url-loader'),
                            options: {
                                limit: imageInlineSizeLimit,
                                mimetype: 'image/avif',
                                name: 'static/images/[name].[hash:8].[ext]',
                            },
                        },
                        // "url" loader works like "file" loader except that it embeds assets
                        // smaller than specified limit in bytes as data URLs to avoid requests.
                        // A missing `test` is equivalent to a match.
                        {
                            test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
                            loader: require.resolve('url-loader'),
                            options: {
                                limit: imageInlineSizeLimit,
                                name: 'static/images/[name].[hash:8].[ext]',
                            },
                        },
                        {
                            test: /\.html$/,
                            use: [
                                {
                                    // transpile the contents of <script> in .html
                                    loader: require.resolve('babel-loader'),
                                    options: babelOption
                                },
                                {
                                    loader: require.resolve('html-loader'),
                                    options: htmlAttrsOptions
                                }
                            ]
                        },
                        // Process application JS with Babel.
                        // The preset includes JSX, Flow, TypeScript, and some ESnext features.
                        {
                            test: /\.(js|mjs|jsx|ts|tsx)$/,
                            include: paths.appSrc, // 处理src
                            loader: require.resolve('babel-loader'),
                            options: {
                                customize: require.resolve(
                                    'babel-preset-react-app/webpack-overrides'
                                ),
                                presets: [
                                    [
                                        // CRA 自定义了 babel配置, 独立成了一个模块 babel-preset-react-app
                                        // https://github.com/facebook/create-react-app/tree/master/packages/babel-preset-react-app
                                        // 在babel-preset-react-app/create.js中已经集成了3种官方preset：@babel/preset-env、@babel/preset-react、@babel/preset-typescript
                                        'react-app',
                                        {
                                            // https://babeljs.io/docs/en/babel-preset-react/#both-runtimes
                                            runtime: hasJsxRuntime ? 'automatic' : 'classic', // Decides which runtime to use
                                        },
                                    ],
                                ],
                                plugins: [
                                    require.resolve('@umijs/babel-plugin-auto-css-modules'), // https://pengtikui.cn/webpack-auto-css-modules/
                                    [
                                        // https://stackoverflow.com/questions/63531768/what-does-babel-plugin-named-asset-import-do/63531847
                                        // https://github.com/facebook/create-react-app/issues/3722
                                        require.resolve('babel-plugin-named-asset-import'),
                                        {
                                            loaderMap: {
                                                svg: {
                                                    ReactComponent: '@svgr/webpack?-svgo,+titleProp,+ref![path]',
                                                },
                                            },
                                        },
                                    ],
                                    isEnvDevelopment &&
                                    shouldUseReactRefresh &&
                                    require.resolve('react-refresh/babel'), // ! 'react-hot-loader/babel'
                                ].filter(Boolean),
                                // This is a feature of `babel-loader` for webpack (not Babel itself).
                                // It enables caching results in ./node_modules/.cache/babel-loader/
                                // directory for faster rebuilds.
                                cacheDirectory: true,
                                // See #6846 for context on why cacheCompression is disabled
                                cacheCompression: false,
                                compact: isEnvProduction,
                            },
                        },
                        // Process any JS outside of the app with Babel.
                        // Unlike the application JS, we only compile the standard ES features.
                        {
                            test: /\.(js|mjs)$/,
                            exclude: /@babel(?:\/|\\{1,2})runtime/, // 处理上一种include之外的文件，主要是node_module（只处理标准es特性）
                            loader: require.resolve('babel-loader'),
                            options: babelOption
                        },
                        // "postcss" loader applies autoprefixer to our CSS.
                        // "css" loader resolves paths in CSS and adds assets as dependencies.
                        // "style" loader turns CSS into JS modules that inject <style> tags.
                        // In production, we use MiniCSSExtractPlugin to extract that CSS
                        // to a file, but in development "style" loader enables hot editing
                        // of CSS.
                        // By default we support CSS Modules with the extension .module.css
                        // Adds support for CSS Modules (https://github.com/css-modules/css-modules)
                        // using the extension .module.css
                        {
                            test: cssRegex,
                            resourceQuery: /modules/,
                            use: getStyleLoaders({
                                importLoaders: 1,
                                modules: {
                                    getLocalIdent: getCSSModuleLocalIdent
                                }
                            })
                        },
                        {
                            test: cssRegex,
                            use: getStyleLoaders({
                                importLoaders: 1
                            }),
                            // Don't consider CSS imports dead code even if the
                            // containing package claims to have no side effects.
                            // Remove this when webpack adds a warning or an error for this.
                            // See https://github.com/webpack/webpack/issues/6571
                            sideEffects: true
                        },
                        // Opt-in support for SASS (using .scss or .sass extensions).
                        // By default we support SASS Modules with the
                        // extensions .module.scss or .module.sass
                        {
                            test: sassRegex,
                            resourceQuery: /modules/,
                            use: getStyleLoaders(
                                {
                                    importLoaders: 2,
                                    modules: {
                                        getLocalIdent: getCSSModuleLocalIdent
                                    }
                                },
                                'sass-loader'
                            )
                        },
                        {
                            test: sassRegex,
                            use: getStyleLoaders(
                                {
                                    importLoaders: 2
                                },
                                'sass-loader'
                            ),
                            // Don't consider CSS imports dead code even if the
                            // containing package claims to have no side effects.
                            // Remove this when webpack adds a warning or an error for this.
                            // See https://github.com/webpack/webpack/issues/6571
                            sideEffects: true
                        },
                        {
                            test: lessRegex,
                            resourceQuery: /modules/,
                            use: getStyleLoaders(
                                {
                                    importLoaders: 2,
                                    modules: {
                                        getLocalIdent: getCSSModuleLocalIdent
                                    }
                                },
                                'less-loader'
                            )
                        },
                        {
                            test: lessRegex,
                            use: getStyleLoaders(
                                {
                                    importLoaders: 2
                                },
                                'less-loader'
                            ),
                            // Don't consider CSS imports dead code even if the
                            // containing package claims to have no side effects.
                            // Remove this when webpack adds a warning or an error for this.
                            // See https://github.com/webpack/webpack/issues/6571
                            sideEffects: true
                        },
                        {
                            test: /\.(txt|htm)$/,
                            loader: require.resolve('raw-loader') // allows importing files as a String
                        },
                        {
                            test: /\.(mp4|webm|wav|mp3|m4a|aac|oga)$/,
                            loader: require.resolve('file-loader'),
                            options: {
                                name: 'static/media/[name].[hash:8].[ext]',
                                esModule: true
                            }
                        },
                        // "file" loader makes sure those assets get served by WebpackDevServer.
                        // When you `import` an asset, you get its (virtual) filename.
                        // In production, they would get copied to the `build` folder.
                        // This loader doesn't use a "test" so it will catch all modules
                        // that fall through the other loaders.
                        {
                            loader: require.resolve('file-loader'),
                            // Exclude `js` files to keep "css" loader working as it injects
                            // its runtime that would otherwise be processed through "file" loader.
                            // Also exclude `html` and `json` extensions so they get processed
                            // by webpacks internal loaders.
                            exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.(txt|htm)$/],
                            options: {
                                name: 'static/file/[name].[hash:8].[ext]',
                            },
                        },
                        // ** STOP ** Are you adding a new loader?
                        // Make sure to add the new loader(s) before the "file" loader.
                    ],
                },
            ],
        },
        plugins: [
            // Generates an `index.html` file with the <script> injected.
            // https://github.com/jantimon/html-webpack-plugin
            ...getMultiHtmlInjects(),
            // Inlines the webpack runtime script. This script is too small to warrant
            // a network request.
            // https://github.com/facebook/create-react-app/issues/5358
            isEnvProduction &&
            shouldInlineRuntimeChunk &&
            new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]), // 处理 runtime 文件
            // Makes some environment variables available in index.html.
            // The public URL is available as %PUBLIC_URL% in index.html, e.g.:
            // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
            // It will be an empty string unless you specify "homepage"
            // in `package.json`, in which case it will be the pathname of that URL.
            new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
            // This gives some necessary context to module not found errors, such as
            // the requesting resource.
            new ModuleNotFoundPlugin(paths.root), // ! 这里有差异
            // Makes some environment variables available to the JS code, for example:
            // if (process.env.NODE_ENV === 'production') { ... }. See `./env.js`.
            // It is absolutely essential that NODE_ENV is set to production
            // during a production build.
            // Otherwise React will be compiled in the very slow development mode.
            new webpack.DefinePlugin(env.stringified), // 等价于 new webpack.EnvironmentPlugin(env.raw) // https://www.w3cschool.cn/doc_webpack/webpack-plugins-environment-plugin.html
            // This is necessary to emit hot updates (CSS and Fast Refresh):
            isEnvDevelopment && new webpack.HotModuleReplacementPlugin(),
            // Experimental hot reloading for React .
            // https://github.com/facebook/react/tree/master/packages/react-refresh
            isEnvDevelopment &&
            shouldUseReactRefresh &&
            new ReactRefreshWebpackPlugin({
                overlay: {
                    entry: webpackDevClientEntry,
                    // The expected exports are slightly different from what the overlay exports,
                    // so an interop is included here to enable feedback on module-level errors.
                    module: reactRefreshOverlayEntry,
                    // Since we ship a custom dev client and overlay integration,
                    // the bundled socket handling logic can be eliminated.
                    sockIntegration: false,
                },
            }),
            // Watcher doesn't work well if you mistype casing in a path so we use
            // a plugin that prints an error when you attempt to do this.
            // See https://github.com/facebook/create-react-app/issues/240
            isEnvDevelopment && new CaseSensitivePathsPlugin(),
            // If you require a missing module and then `npm install` it, you still have
            // to restart the development server for webpack to discover it. This plugin
            // makes the discovery automatic so you don't have to restart.
            // See https://github.com/facebook/create-react-app/issues/186
            isEnvDevelopment &&
            new WatchMissingNodeModulesPlugin(paths.appNodeModules),
            isEnvProduction &&
            // https://github.com/Klathmon/imagemin-webpack-plugin
            // Make sure that the plugin is after any plugins that add images
            new ImageminPlugin({
                // Cache already minified images into a cacheFolder. On next run plugin will check for the cached images first.
                cacheFolder: path.resolve(paths.appNodeModules, '.cache/imagemin'),
            }),
            isEnvProduction &&
            new MiniCssExtractPlugin({
                // Options similar to the same options in webpackOptions.output
                // both options are optional
                filename: 'static/css/[name].[contenthash:8].css',
                chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
                ignoreOrder: true // 设为true会禁用报错，默认 false即报警
            }),
            // Generate an asset manifest file with the following content:
            // - "files" key: Mapping of all asset filenames to their corresponding
            //   output file so that tools can pick it up without having to parse
            //   `index.html`
            // - "entrypoints" key: Array of files which are included in `index.html`,
            //   can be used to reconstruct the HTML if necessary
            // // ! 感觉生成manifest.json清单可能是不必要的，貌似这个插件是生成了实体文件，不用插件也会有这个manifest映射关系，有了json主要是给服务端渲染用的？
            // new ManifestPlugin({
            //     fileName: 'asset-manifest.json',
            //     publicPath: paths.publicUrlOrPath,
            //     generate: (seed, files, entrypoints) => {
            //         const manifestFiles = files.reduce((manifest, file) => {
            //             manifest[file.name] = file.path;

            //             return manifest;
            //         }, seed);
            //         const entrypointFiles = entrypoints.main.filter(
            //             fileName => !fileName.endsWith('.map')
            //         );

            //         return {
            //             files: manifestFiles,
            //             entrypoints: entrypointFiles,
            //         };
            //     },
            // }),
            // Moment.js is an extremely popular library that bundles large locale files
            // by default due to how webpack interprets its code. This is a practical
            // solution that requires the user to opt into importing specific locales.
            // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
            // You can remove this if you don't use Moment.js:
            new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
            // Generate a service worker script that will precache, and keep up to date,
            // the HTML & assets that are part of the webpack build.
            isEnvProduction &&
            fs.existsSync(swSrc) &&
            new WorkboxWebpackPlugin.InjectManifest({
                swSrc,
                dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
                exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
                // Bump up the default maximum size (2mb) that's precached,
                // to make lazy-loading failure scenarios less likely.
                // See https://github.com/cra-template/pwa/issues/13#issuecomment-722667270
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            }),
            // TypeScript type checking
            // fork 一个进程，专门来运行Typescript类型检查，利用多核资源来提升编译的速度.
            useTypeScript &&
            process.env.DISABLE_TSC_CHECK !== 'true' &&
            // https://github.com/yangfan-coder/fork-ts-checker-webpack-plugin
            new ForkTsCheckerWebpackPlugin({
                typescript: resolve.sync('typescript', {
                    basedir: paths.appNodeModules,
                }),
                async: isEnvDevelopment, // true，则在webpack编译完成后报告问题，不影响 webpack 的编译；为 false，同步的将错误信息反馈给 webpack，如果报错了，webpack 就会编译失败
                useTypescriptIncrementalApi: true, // Defaults to true when working with TypeScript 3+，
                // measureCompilationTime: true, // ! 暂时不输出耗时
                checkSyntacticErrors: true, // true, ensure that the plugin checks for both syntactic errors and semantic errors
                // resolveModuleNameModule: process.versions.pnp
                //     ? `${__dirname}/pnpTs.js`
                //     : undefined,
                // resolveTypeReferenceDirectiveModule: process.versions.pnp
                //     ? `${__dirname}/pnpTs.js`
                //     : undefined,
                tsconfig: paths.appTsConfig, // ! 这里用的ts配置文件不同
                compilerOptions: {
                    jsx: hasJsxRuntime ? (isEnvProduction ? 'react-jsx' : 'react-jsxdev') : 'preserve',
                    checkJs: false
                },
                // reportFiles: [ // Only report errors on files matching these glob patterns.
                //     // This one is specifically to match during CI tests,
                //     // as micromatch doesn't match
                //     // '../cra-template-typescript/template/src/App.tsx'
                //     // otherwise.
                //     '../**/src/**/*.{ts,tsx}',
                //     '**/src/**/*.{ts,tsx}',
                //     '!**/src/**/__tests__/**',
                //     '!**/src/**/?(*.)(spec|test).*',
                //     '!**/src/setupProxy.*',
                //     '!**/src/setupTests.*',
                // ],
                silent: true,
                // The formatter is invoked directly in WebpackDevServerUtils during development
                formatter: isEnvProduction ? typescriptFormatter : undefined,
            }),
            new ESLintPlugin({
                // Plugin options
                extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
                formatter: require.resolve('react-dev-utils/eslintFormatter'),
                eslintPath: require.resolve('eslint'),
                context: paths.appSrc,
                cache: true,
                cacheLocation: path.resolve(
                    paths.appNodeModules,
                    '.cache/.eslintcache'
                ),
                // ESLint class options https://eslint.org/docs/developer-guide/nodejs-api#parameters
                cwd: paths.root,
                resolvePluginsRelativeTo: __dirname,
                baseConfig: {
                    extends: [require.resolve('eslint-config-react-app/base')],
                    rules: {
                        ...(!hasJsxRuntime && {
                            'react/react-in-jsx-scope': 'error',
                        }),
                    },
                },
            }),
            // 只在入口 chunk 文件头部添加 banner
            new webpack.BannerPlugin({
                banner: `@author ${pkg.author}`,
                entryOnly: true
            })
        ].filter(Boolean),
        // Some libraries import Node modules but don't use them in the browser.
        // Tell webpack to provide empty mocks for them so importing them works.
        node: {
            __filename: true,
            __dirname: true,
            module: 'empty',
            dgram: 'empty',
            dns: 'mock',
            fs: 'empty',
            http2: 'empty',
            net: 'empty',
            tls: 'empty',
            child_process: 'empty',
        },
        // Turn off performance processing because we utilize
        // our own hints via the FileSizeReporter
        performance: false,
    };
};
