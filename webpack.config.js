const path = require("path");
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { EsbuildPlugin } = require('esbuild-loader');

module.exports = {
    entry: {
        index: "./scripts/main.js",
        raycastWorker: "./scripts/helpers/raycastWorker.js",
    },
    output: {
        filename: "[name].js",
        chunkFilename: "index.worker.js",
        publicPath: "/modules/levels-3d-preview/",
        path: path.resolve(__dirname),
    },
    mode: "development",
    devtool: "source-map",

    optimization: {
        usedExports: true,
        minimize: true,
        minimizer: [
            new EsbuildPlugin({
                target: 'esnext',
                minifyIdentifiers: false,
                minifySyntax: true,
                minifyWhitespace: true,
            })
        ],
    },

    module: {
        rules: [
            {
                test: /DRACOLoader\.js$/,
                parser: { url: false },
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: [{
                    loader: 'esbuild-loader',
                    options: {
                        target: 'esnext',
                        sourcemap: true,
                    }
                }],
            },
            {
                test: /\.scss$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    {
                        loader: 'css-loader',
                        options: { url: false }
                    },
                    'sass-loader'
                ]
            }
        ],
    },

    plugins: [
        new MiniCssExtractPlugin({ filename: 'styles/module.css' }),
    ]
};