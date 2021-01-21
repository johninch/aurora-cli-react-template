module.exports = {
    scripts: {
        start: 'node scripts/start.js',
    },
    browserslist: ['>0.2%', 'not dead', 'not op_mini all', 'ie >= 10'],
    babel: {
        presets: ['react-app'],
        plugins: []
    },
    eslintConfig: {
        extends: ['react-app', './scripts/config/eslintrc.js']
    },
    engines: { node: '>=10.13.0' }
};
