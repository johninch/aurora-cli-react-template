'use strict';

const chalk = require('chalk');

module.exports = function printBuildError(err) {
    const message = err != null && err.message;
    const stack = err != null && err.stack;

    // Add more helpful message for Terser error
    if (
        stack &&
        typeof message === 'string' &&
        message.indexOf('from Terser') !== -1
    ) {
        try {
            const matched = /(.+)\[(.+):(.+),(.+)\]\[.+\]/.exec(stack);
            if (!matched) {
                throw new Error('Using errors for control flow is bad.');
            }
            const problemPath = matched[2];
            const line = matched[3];
            const column = matched[4];
            console.log(
                '代码压缩异常：\n\n',
                chalk.yellow(
                    `\t${problemPath}:${line}${column !== '0' ? ':' + column : ''}`
                ),
                '\n'
            );
        } catch (ignored) {
            console.log('压缩bundle失败。', err);
        }
        console.log('了解更多：https://cra.link/failed-to-minify');
    } else {
        console.log((message || err) + '\n');
    }
    console.log();
};
