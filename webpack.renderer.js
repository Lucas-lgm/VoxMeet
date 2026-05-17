const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const WebpackObfuscator = require('webpack-obfuscator');
const { VueLoaderPlugin } = require('vue-loader');

const isDevelopment = process.env.NODE_ENV === 'development';

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  entry: {
    renderer: './src/renderer/index.ts',
    popup: './src/renderer/popup/index.ts',
    'main-renderer': './src/renderer/main/main.ts',
  },
  target: 'electron-renderer',
  devtool: isDevelopment ? 'source-map' : false,
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.js', '.vue'],
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@types': path.resolve(__dirname, 'src/renderer/types'),
      '@dom': path.resolve(__dirname, 'src/renderer/dom'),
      '@audio': path.resolve(__dirname, 'src/renderer/audio'),
      '@utils': path.resolve(__dirname, 'src/renderer/utils')
    }
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'vue-loader'
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.renderer.json',
            appendTsSuffixTo: [/\.vue$/]
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      }
    ]
  },
  plugins: [
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
      chunks: ['renderer'],
    }),
    new HtmlWebpackPlugin({
      template: './src/renderer/popup/index.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './src/renderer/main/index.html',
      filename: 'main/index.html',
      chunks: ['main-renderer'],
    }),
    new MiniCssExtractPlugin({
      filename: 'styles.css'
    }),
    ...(isDevelopment ? [] : [
      new WebpackObfuscator({
        rotateStringArray: true,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        identifierNamesGenerator: 'hexadecimal',
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: true,
        disableConsoleOutput: true,
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: true,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        transformObjectKeys: true,
        unicodeEscapeSequence: false
      })
    ])
  ]
}; 