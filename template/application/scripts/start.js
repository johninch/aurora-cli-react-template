// Do this as the first thing so that any code reading it knows the right env.
// ! 设置了两个环境变量，因为 start 是用来跑开发的，所以这里的环境变量都是 development
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
// ! 给 process 绑定一个错误监听函数，这个错误监听实质上是用来监听 一些没有被.catch的Promise
process.on('unhandledRejection', err => {
    throw err;
});

// Ensure environment variables are read.
require('./config/env');

const fs = require('fs');
const chalk = require('react-dev-utils/chalk');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const clearConsole = require('react-dev-utils/clearConsole');

const ora = require('ora'); // todo

const checkRequiredFiles = require('react-dev-utils/checkRequiredFiles');
const semver = require('semver');
const openBrowser = require('react-dev-utils/openBrowser');
const { checkBrowsers } = require('react-dev-utils/browsersHelper');

const {
    choosePort,
    createCompiler,
    prepareProxy,
    prepareUrls,
} = require('./config/rewiredWebpackDevServerUtils');
const paths = require('./config/paths'); // ! 在env.js里面delete掉node.cache，这里const paths = require('../config/paths)就不会从缓存里面去拿而是重新去加载
const configFactory = require('./config/webpack.config');

const checkMissDependencies = require('./config/checkMissDependencies');
const createDevServerConfig = require('./config/rewiredWebpackDevServer.config');

const pkg = require(paths.appPackageJson);
const getClientEnvironment = require('./config/env');
const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));
const react = require(require.resolve('react', { paths: [paths.appPath] }));

const isInteractive = process.stdout.isTTY;
// Warn and crash if required files are missing
if (!checkRequiredFiles([paths.appHtml, paths.appIndexJs])) {
    // ! 先判断一下我们两个入口文件有没有存在，分别是 project_path/public/index.html 和 project_path/src/index.js，如果不存在给出提示结束程序。
    process.exit(1);
}

// Tools like Cloud9 rely on this.
// ! 设置默认的端口和host，如果有特殊的需求，可以从环境变量传进去改变，没有就会用默认的3000端口。
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const spinner = ora('启动webpack').start();

// We require that you explicitly set browsers and do not fall back to
// browserslist defaults.

checkMissDependencies(spinner).then(() => {
    return checkBrowsers(paths.root, isInteractive)
        .then(() => {
            // We attempt to use the default port but if it is busy, we offer the user to
            // run on a different port. `choosePort()` Promise resolves to the next free port.
            return choosePort(HOST, DEFAULT_PORT, spinner); // ! 判断这个端口有没有被其他的进程占用，有的话会提供下一个可用的端口
        })
        .then(port => {
            if (port == null) {
                // We have not found a port.
                console.log();

                spinner.fail(
                    `请关闭占用 ${chalk.bold(
                        chalk.yellow(DEFAULT_PORT)
                    )} 端口的程序后再运行；或者指定一个新的端口：${chalk.bold(chalk.yellow('PORT=4000 npm start'))}`
                );

                console.log();
                process.exit(0);
            }

            // ! 把环境变量和配置组装起来，开个webpack本地调试服务
            const config = configFactory('development');

            const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
            const appName = pkg.name;

            const useYarn = fs.existsSync(paths.yarnLockFile);

            const useTypeScript = fs.existsSync(paths.appTsConfig);
            const tscCompileOnError = process.env.TSC_COMPILE_ON_ERROR === 'true';
            // ! 获取当前的 host, port, protocol 生成一系列url
            const urls = prepareUrls(
                protocol,
                HOST,
                port,
                paths.publicUrlOrPath.slice(0, -1) // ! .slice(0,-1); 从索引0开始，到索引最后一个结束，不包括最后索引项，即只抛弃最后一项
            );
            const devSocket = {
                warnings: warnings =>
                    devServer.sockWrite(devServer.sockets, 'warnings', warnings),
                errors: errors =>
                    devServer.sockWrite(devServer.sockets, 'errors', errors),
            };
            // Create a webpack compiler that is configured with custom messages.
            // ! 生成一个 webpackCompiler
            const compiler = createCompiler({
                appName,
                // config: paths.useNodeEnv ? [config, nodeConfig] : [config], // ! 注意，如果这里传入数组，会生成 multicompiler，需要遍历 https://webpack.docschina.org/api/node/#multicompiler
                config,
                urls,
                useYarn,
                webpack,
                devSocket,
                useTypeScript,
                tscCompileOnError,
                spinner
            });

            // Load proxy config
            // ! 加载代理的配置，在 project_path/package.json 里面加载配置
            const proxySetting = pkg.proxy;
            const proxyConfig = prepareProxy(
                proxySetting,
                paths.appPublic,
                paths.publicUrlOrPath
            );
            // Serve webpack assets generated by the compiler over a web server.
            // ! 生成 webpack dev server 的配置
            const serverConfig = createDevServerConfig(
                proxyConfig,
                urls.lanUrlForConfig
            );

            const devServer = new WebpackDevServer(compiler, serverConfig);

            // Launch WebpackDevServer.
            devServer.listen(port, HOST, err => {
                // ! 监听 devServer
                // ! 一些日志输出
                if (err) {
                    return console.log(err);
                }

                if (isInteractive) {
                    clearConsole();
                }

                if (env.raw.FAST_REFRESH && semver.lt(react.version, '16.10.0')) {
                    console.log(
                        chalk.yellow(
                            `Fast Refresh 需要 React版本 在 16.10及以上。你当前使用的 React版本 为 ${react.version}。`
                        )
                    );
                }

                console.log(chalk.cyan('正在启动测试服务器...\n'));
                // ! 自动用默认浏览器打开调试链接
                openBrowser(urls.localUrlForBrowser);
            });

            ['SIGINT', 'SIGTERM'].forEach(function(sig) {
                process.on(sig, function() {
                    devServer.close();
                    process.exit();
                });
            });

            if (isInteractive || process.env.CI !== 'true') {
                // Gracefully exit when stdin ends
                process.stdin.on('end', function() {
                    devServer.close();
                    process.exit();
                });

                process.stdin.resume();
            }
        })
        .catch(err => {
            if (err && err.message) {
                console.log(err.message);
            }

            spinner.stop();

            // process.kill(process.pid, 'SIGINT');
            process.exit(1);
        });
})
