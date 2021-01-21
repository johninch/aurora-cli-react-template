const fs = require('fs');
const path = require('path');
const url = require('url');
const address = require('address');
const chalk = require('chalk');
const detect = require('detect-port-alt'); // ! 用到detect-port-alt去检测端口占用，如果被占用了返回一个最接近的递增方向可用的端口，比如3000端口被占用,3001没被占用就返回回来。
const isRoot = require('is-root');
const inquirer = require('inquirer');
const clearConsole = require('react-dev-utils/clearConsole');
const formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');
const getProcessForPort = require('react-dev-utils/getProcessForPort');
const typescriptFormatter = require('react-dev-utils/typescriptFormatter');
const forkTsCheckerWebpackPlugin = require('react-dev-utils/ForkTsCheckerWebpackPlugin');

const isInteractive = process.stdout.isTTY;

function choosePort(host, defaultPort, spinner) {
    return detect(defaultPort, host).then(
        port =>
            new Promise(resolve => {
                if (port === defaultPort) {
                    return resolve(port);
                }

                spinner.stop();

                const message =
                    process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
                        ? `以低于1024的端口来运行服务，需要管理员权限。`
                        : `端口 ${defaultPort} 已经被占用。`;

                if (isInteractive) {
                    clearConsole();

                    const existingProcess = getProcessForPort(defaultPort);
                    const question = {
                        type: 'confirm',
                        name: 'shouldChangePort',
                        message:
                            `${chalk.yellow(
                                `${message
                                }${existingProcess ? ` 可能的程序是：\n  ${existingProcess}` : ''}`
                            )}\n\n要换一个端口运行本程序吗？`,
                        default: true,
                    };

                    inquirer.prompt(question).then(answer => {
                        if (answer.shouldChangePort) {
                            resolve(port);
                            console.log();

                            spinner.start();
                        } else {
                            resolve(null);
                        }
                    });
                } else {
                    console.log(chalk.red(message));
                    resolve(null);
                }
            }),
        err => {
            throw new Error(
                `${chalk.red(`无法为 ${chalk.bold(host)} 找到可用端口。`)
                }\n${`网络错误信息：${err.message}` || err
                }\n`
            );
        }
    );
}

function printInstructions(appName, urls, useYarn, spinner) {
    console.log();
    spinner.succeed(chalk.green(`应用(${appName})已启动，你可以打开浏览器查看:`));
    console.log();

    if (urls.lanUrlForTerminal) {
        console.log(`  ${chalk.bold('本地:')}  ${chalk.cyan(urls.localUrlForTerminal)}`);
        console.log(`  ${chalk.bold('远程:')}  ${chalk.cyan(urls.lanUrlForTerminal)}`);
    } else {
        console.log(`  ${urls.localUrlForTerminal}`);
    }

    console.log();
    console.log('tip：开发版本的构建是未优化的。');

    console.log(
        `可运行 ${chalk.cyan(`${useYarn ? 'yarn' : 'npm run'} build`)}，` +
        `完成生产版本的构建。`
    );

    console.log();
}

function createCompiler({
    appName,
    config,
    devSocket,
    urls,
    useYarn,
    useTypeScript,
    tscCompileOnError,
    webpack,
    spinner
}) {
    // "Compiler" is a low-level interface to webpack.
    // It lets us listen to some events and provide our own custom messages.
    let compiler;
    let stime = Date.now();

    try {
        compiler = webpack(config);
    } catch (err) {
        console.log(chalk.red('启动编译失败.'));
        console.log();
        console.log(err.message || err);
        console.log();
        process.exit(1);
    }

    // "invalid" event fires when you have changed a file, and webpack is
    // recompiling a bundle. WebpackDevServer takes care to pause serving the
    // bundle, so if you refresh, it'll wait instead of serving the old one.
    // "invalid" is short for "bundle invalidated", it doesn't imply any errors.
    compiler.hooks.invalid.tap('invalid', () => {
        // ! invalid 钩子，如果当前处于TTY终端，那么先清除控制台再输出 Compiling...
        if (isInteractive) {
            clearConsole();
        }

        stime = Date.now();
        spinner.text = chalk.cyan('编译中...');
    });

    let isFirstCompile = true;
    let tsMessagesPromise;
    let tsMessagesResolver;
    let tsCompilerIndex;

    if (useTypeScript) {
        // https://webpack.docschina.org/api/node/
        // https://github.com/TypeStrong/fork-ts-checker-webpack-plugin/issues/273
        compiler.hooks.beforeCompile.tap('beforeCompile', () => {
            tsMessagesPromise = new Promise(resolve => {
                tsMessagesResolver = msgs => resolve(msgs);
            });

            tsCompilerIndex = index;
        });

        forkTsCheckerWebpackPlugin
            .getCompilerHooks(compiler)
            .receive.tap('afterTypeScriptCheck', (diagnostics, lints) => {
                const allMsgs = [...diagnostics, ...lints];
                const format = message => `${message.file}\n${typescriptFormatter(message, true)}`;

                tsCompilerIndex === index &&
                    tsMessagesResolver({
                        errors: allMsgs.filter(msg => msg.severity === 'error').map(format),
                        warnings: allMsgs.filter(msg => msg.severity === 'warning').map(format)
                    });
            });
    }

    // "done" event fires when webpack has finished recompiling the bundle.
    // Whether or not you have warnings or errors, you will get this event.
    compiler.hooks.done.tap('done', async stats => {
        // ! 监听了 done 事件，对输出的日志做了格式化输出
        // ! 正常情况下会直接输出 `Compiled successfully!`
        // ! 如果有错误则输出错误信息，这里对错误信息做一些处理，让其输出比较友好
        if (isInteractive) {
            clearConsole();
        }

        const useTimer = (isTotal = false) =>
            chalk.grey(`(编译${isTotal ? '总' : '已'}耗时: ${(Date.now() - stime) / 1000}s)`);

        // We have switched off the default webpack output in WebpackDevServer
        // options so we are going to "massage" the warnings and errors and present
        // them in a readable focused way.
        // We only construct the warnings and errors for speed:
        // https://github.com/facebook/create-react-app/issues/4492#issuecomment-421959548
        const statsData = stats.toJson({
            all: false,
            warnings: true,
            errors: true,
        });

        if (useTypeScript && statsData.errors.length === 0) {
            const delayedMsg = setTimeout(() => {
                // console.log(
                //     chalk.yellow(
                //         'Files successfully emitted, waiting for typecheck results...'
                //     )
                // );
                spinner.text = chalk.cyan('文件已编译，正在进行TSC检查...') + useTimer();
            }, 100);

            const messages = process.env.DISABLE_TSC_CHECK === 'true' ? { errors: [], warnings: [] } : await tsMessagesPromise;

            clearTimeout(delayedMsg);

            if (tscCompileOnError) {
                statsData.warnings.push(...messages.errors);
            } else {
                statsData.errors.push(...messages.errors);
            }

            statsData.warnings.push(...messages.warnings);

            // Push errors and warnings into compilation result
            // to show them after page refresh triggered by user.
            if (tscCompileOnError) {
                stats.compilation.warnings.push(...messages.errors);
            } else {
                stats.compilation.errors.push(...messages.errors);
            }

            stats.compilation.warnings.push(...messages.warnings);

            if (messages.errors.length > 0) {
                if (tscCompileOnError) {
                    devSocket.warnings(messages.errors);
                } else {
                    devSocket.errors(messages.errors);
                }
            } else if (messages.warnings.length > 0) {
                devSocket.warnings(messages.warnings);
            }

            if (isInteractive) {
                clearConsole();
            }
        }

        const messages = formatWebpackMessages(statsData);
        const isSuccessful = !messages.errors.length && !messages.warnings.length;

        if (isSuccessful) {
            // console.log(chalk.green('Compiled successfully!'));
            spinner.succeed(chalk.green(`编译完成！${useTimer(true)}`));
        }

        if (isSuccessful && (isInteractive || isFirstCompile)) {
            printInstructions(appName, urls, useYarn, spinner);
        }

        isFirstCompile = false;

        // If errors exist, only show errors.
        if (messages.errors.length) {
            // Only keep the first error. Others are often indicative
            // of the same problem, but confuse the reader with noise.
            if (messages.errors.length > 1) {
                messages.errors.length = 1;
            }

            console.log(chalk.red('Failed to compile.\n'));
            console.log(messages.errors.join('\n\n'));

            return;
        }

        // Show warnings if no errors were found.
        if (messages.warnings.length) {
            console.log(chalk.yellow('Compiled with warnings.\n'));
            console.log(messages.warnings.join('\n\n'));

            // Teach some ESLint tricks.
            console.log(
                `\nSearch for the ${chalk.underline(chalk.yellow('keywords'))
                } to learn more about each warning.`
            );

            console.log(
                `To ignore, add ${chalk.cyan('// eslint-disable-next-line')
                } to the line before.\n`
            );
        }
    });

    console.log();
    spinner.text = chalk.cyan('webpack运行中...');
    spinner.render().start();

    return compiler;
}

function resolveLoopback(proxy) {
    const o = url.parse(proxy);

    o.host = undefined;

    if (o.hostname !== 'localhost') {
        return proxy;
    }
    // Unfortunately, many languages (unlike node) do not yet support IPv6.
    // This means even though localhost resolves to ::1, the application
    // must fall back to IPv4 (on 127.0.0.1).
    // We can re-enable this in a few years.
    /* try {
      o.hostname = address.ipv6() ? '::1' : '127.0.0.1';
    } catch (_ignored) {
      o.hostname = '127.0.0.1';
    }*/

    try {
        // Check if we're on a network; if we are, chances are we can resolve
        // localhost. Otherwise, we can just be safe and assume localhost is
        // IPv4 for maximum compatibility.
        if (!address.ip()) {
            o.hostname = '127.0.0.1';
        }
    } catch (_ignored) {
        o.hostname = '127.0.0.1';
    }

    return url.format(o);
}

// We need to provide a custom onError function for httpProxyMiddleware.
// It allows us to log custom error messages on the console.
function onProxyError(proxy) {
    return (err, req, res) => {
        const host = req.headers && req.headers.host;

        console.log(
            `${chalk.red('Proxy代理错误：')
            } 不能代理请求 ${chalk.cyan(req.url)
            } 从 ${chalk.cyan(host)
            } 到 ${chalk.cyan(proxy)
            }。`
        );

        console.log(
            `点击 https://nodejs.org/api/errors.html#errors_common_system_errors 查看更多信息 (${chalk.cyan(err.code)
            }).`
        );

        console.log();

        // And immediately send the proper error response to the client.
        // Otherwise, the request will eventually timeout with ERR_EMPTY_RESPONSE on the client side.
        if (res.writeHead && !res.headersSent) {
            res.writeHead(500);
        }

        res.end(
            `Proxy代理错误：不能代理请求 ${req.url
            } 从${host
            } 到 ${proxy
            } (${err.code
            }).`
        );
    };
}

/**
 * @param {string | object} proxy
 * @param {*} appPublicFolder
 * @param {*} servedPathname
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
    // `proxy` lets you specify alternate servers for specific requests.
    if (!proxy) {
        return undefined;
    }

    if (typeof proxy !== 'string') {
        return Object.keys(proxy).map(function(path) {
            const opt =
                typeof proxy[path] === 'object'
                    ? proxy[path]
                    : {
                        target: proxy[path]
                    };
            const target = opt.target;

            return Object.assign(
                {
                    logLevel: 'silent'
                },
                opt,
                {
                    context: function(pathname, req) {
                        return (
                            req.method !== 'GET' ||
                            (mayProxy(pathname) &&
                                req.headers.accept &&
                                req.headers.accept.indexOf('text/html') === -1)
                        );
                    },
                    onProxyReq: proxyReq => {
                        if (proxyReq.getHeader('origin')) {
                            proxyReq.setHeader('origin', target);
                        }
                    },
                    onError: onProxyError(target),
                    secure: false,
                    changeOrigin: true,
                    ws: true,
                    xfwd: true,
                }
            );
        });
    }

    // If proxy is specified, let it handle any request except for
    // files in the public folder and requests to the WebpackDevServer socket endpoint.
    // https://github.com/facebook/create-react-app/issues/6720
    const sockPath = process.env.WDS_SOCKET_PATH || '/sockjs-node';
    const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

    function mayProxy(pathname) {
        const maybePublicPath = path.resolve(
            appPublicFolder,
            pathname.replace(new RegExp(`^${servedPathname}`), '')
        );
        const isPublicFileRequest = fs.existsSync(maybePublicPath);
        // used by webpackHotDevClient
        const isWdsEndpointRequest =
            isDefaultSockHost && pathname.startsWith(sockPath);

        return !(isPublicFileRequest || isWdsEndpointRequest);
    }

    if (!/^http(s)?:\/\//.test(proxy)) {
        console.log(chalk.red('当 proxy 被配置在 package.json 中时，它只能是一个 http:// 或者 https:// 开头的字符串或object配置'));
        console.log(chalk.red(`而当前 proxy 的类型是 "${typeof proxy}"。`));
        process.exit(1);
    }

    let target;

    if (process.platform === 'win32') {
        target = resolveLoopback(proxy);
    } else {
        target = proxy;
    }

    return [
        {
            target,
            logLevel: 'silent',
            context: function(pathname, req) {
                return (
                    req.method !== 'GET' ||
                    (mayProxy(pathname) &&
                        req.headers.accept &&
                        req.headers.accept.indexOf('text/html') === -1)
                );
            },
            onProxyReq: proxyReq => {
                // Browsers may send Origin headers even with same-origin
                // requests. To prevent CORS issues, we have to change
                // the Origin to match the target URL.
                if (proxyReq.getHeader('origin')) {
                    proxyReq.setHeader('origin', target);
                }
            },
            onError: onProxyError(target),
            secure: false,
            changeOrigin: true,
            ws: true,
            xfwd: true,
        },
    ];
}

function prepareUrls(protocol, host, port, pathname = '/') {
    const formatUrl = hostname =>
        url.format({
            protocol,
            hostname,
            port,
            pathname,
        });
    const prettyPrintUrl = hostname =>
        url.format({
            protocol,
            hostname,
            port: chalk.bold(port),
            pathname,
        });

    const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
    let prettyHost, lanUrlForConfig, lanUrlForTerminal;

    if (isUnspecifiedHost) {
        prettyHost = 'localhost';

        try {
            // This can only return an IPv4 address
            lanUrlForConfig = address.ip();

            if (lanUrlForConfig) {
                // Check if the address is a private ip
                // https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
                if (
                    /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
                        lanUrlForConfig
                    )
                ) {
                    // Address is private, format it for later use
                    lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig);
                } else {
                    // Address is not private, so we will discard it
                    lanUrlForConfig = undefined;
                }
            }
        } catch (_e) {
            // ignored
        }
    } else {
        prettyHost = host;
    }

    const localUrlForTerminal = prettyPrintUrl(prettyHost);
    const localUrlForBrowser = formatUrl(prettyHost);

    return {
        lanUrlForConfig,
        lanUrlForTerminal,
        localUrlForTerminal,
        localUrlForBrowser,
    };
}

module.exports = {
    choosePort,
    createCompiler,
    prepareProxy,
    prepareUrls,
};
