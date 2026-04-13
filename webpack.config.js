const path = require("path");
const webpack = require("webpack");
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { EsbuildPlugin } = require('esbuild-loader');

module.exports = {
    entry: "./scripts/main.js",
    output: {
        filename: "index.js",
        path: path.resolve(__dirname),
    },
    mode: "development",
    devtool: "eval-source-map", // Better for browser debugging
    
    optimization: {
        minimize: false, // Completely disables the minimizer
        usedExports: true,
    },
    // devtool: false,

    optimization: {
        usedExports: true, // Enables tree shaking
        minimize: true,
        minimizer: [
            new EsbuildPlugin({
                target: 'esnext',
                sourcemap: true,
            })
        ],
    },

    module: {
        rules: [
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
        
        // new webpack.SourceMapDevToolPlugin({
        //     filename: '[file].map',
        //     append: '\n//# sourceMappingURL=[url]', 
        //     module: true,
        //     columns: true,
        //     noSources: false,
        // })
    ]
};