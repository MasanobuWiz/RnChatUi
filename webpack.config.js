// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    mode: isProd ? 'production' : 'development',

    entry: './index.web.js',

    output: {
      path: path.resolve(__dirname, 'web-build'),
      // 本番は contenthash でキャッシュ衝突を回避
      filename: isProd ? 'bundle.[contenthash].js' : 'bundle.js',
      chunkFilename: isProd ? '[name].[contenthash].js' : '[name].js',
      publicPath: '/',
      clean: true,
    },

    resolve: {
      extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.jsx'],
      alias: {
        'react-native$': 'react-native-web',
        'react-native-gesture-handler': 'react-native-gesture-handler/lib/commonjs/web',
      },
      fallback: {
        process: require.resolve('process/browser'),
        buffer: require.resolve('buffer'),
        path: require.resolve('path-browserify'),
        os: require.resolve('os-browserify/browser'),
        crypto: require.resolve('crypto-browserify'),
        util: require.resolve('util'),
        stream: require.resolve('stream-browserify'),
        fs: false,
        net: false,
        tls: false,
      },
      // .mjs を含むパッケージの解決揺れ対策
      extensionAlias: { '.js': ['.js', '.mjs'] },
    },

    module: {
      rules: [
        {
          test: /\.(js|jsx|ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                'module:@react-native/babel-preset',
                '@babel/preset-typescript',
                '@babel/preset-react',
              ],
              plugins: ['@babel/plugin-proposal-class-properties'],
            },
          },
        },
        // fullySpecified エラー抑止（.mjs を含む依存対策）
        { test: /\.m?js$/, resolve: { fullySpecified: false } },

        // 画像を import した場合の出力先（コピーとは別経路）
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          loader: 'file-loader',
          options: {
            name: isProd ? 'assets/[name].[contenthash].[ext]' : 'assets/[name].[ext]',
          },
        },
      ],
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html',
        minify: isProd ? { collapseWhitespace: true, removeComments: true } : false,
      }),

      // プロジェクト直下の /assets をそのまま web-build/assets へコピー
      // （S3/CloudFront に上げる静的ファイル群：icon-google-24.png など）
      new CopyWebpackPlugin({
        patterns: [
          { from: 'assets', to: 'assets', noErrorOnMissing: true },
        ],
      }),

      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      }),

      // ここで NODE_ENV は再定義しない（競合の元になるため）
      new webpack.DefinePlugin({
        global: 'globalThis',
      }),
    ],

    devServer: {
      static: { directory: path.join(__dirname, 'web-build') },
      port: Number(process.env.PORT) || 9000, // 例: PORT=9001 npm run web
      hot: true,
      historyApiFallback: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
    },

    // アセットサイズ系の警告を出さない
    performance: { hints: false },

    // ログはエラー/警告のみ
    stats: 'errors-warnings',
    ignoreWarnings: [
      /Failed to parse source map/,
      /Can't resolve 'process\/browser'/,
    ],
  };
};
