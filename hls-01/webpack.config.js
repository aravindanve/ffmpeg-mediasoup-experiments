const path = require('path');
const webpack = require('webpack');
const WebpackChunkHash = require('webpack-chunk-hash');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './client/src/main.js',
  output: {
    filename: 'main.[chunkhash].js',
    path: path.resolve(__dirname, 'client', 'dist')
  },
  plugins: [
    new CleanWebpackPlugin(['client/dist']),
    new webpack.EnvironmentPlugin({ BUILD_TARGET: 'test' }),
    new WebpackChunkHash({ algorithm: 'md5', digest: 'hex' }),
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'client/src/index.html'
    })
  ],
  devtool: 'source-map'
};
