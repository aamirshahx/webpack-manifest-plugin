const path = require('path');
const fse = require('fs-extra');
const _ = require('lodash');

const pluginName = 'ManifestPlugin';

class ManifestWebpackPlugin {
    moduleAssets = {};
    constructor(options = {}) {
		this.opts = _.assign({
            basePath: '',
            publicPath: '',
            fileName: 'manifest.json',
            stripSrc: null,
            transformExtensions: /^(gz|map)$/i,
            writeToFileEmit: false,
            cache: {},
            stripContent: '',
        }, options);
	}

    getFileType(str) {
        str = str.replace(/\?.*/, '');
        var split = str.split('.');
        var ext = split.pop();
        if (this.opts.transformExtensions.test(ext)) {
            ext = split.pop() + '.' + ext;
        }
        return ext;
    }

	apply(compiler) {
		compiler.hooks.compilation.tap(pluginName, compilation => {
			// compilation.hooks.moduleAsset.tap(pluginName, (module, file) => {
			// 	this.moduleAssets[file] = path.join(
            //         path.dirname(file),
            //         path.basename(module.userRequest)
            //     );
            // })
            compiler.hooks.compilation.tap(pluginName, compilation => {
                compilation.hooks.moduleAsset.tap(pluginName, (module, file) => {
                    this.moduleAssets[file] = path.join(path.dirname(file), path.basename(file));
                })
            });
        });
        
        compiler.hooks.emit.tapAsync(pluginName, this.emitCallback.bind(this));
    }
    
    emitCallback(compilation, compileCallback) {
        const stats = compilation.getStats().toJson();
        let manifest = {};

        _.merge(manifest, compilation.chunks.reduce((memo, chunk) => {
            const chunkName = chunk.name ? chunk.name.replace(this.opts.stripSrc, '') : null;

            // Map original chunk name to output files.
            // For nameless chunks, just map the files directly.
            return chunk.files.reduce((memo, file) => {
                // Don't add hot updates to manifest
                
                if (file.indexOf('hot-update') >= 0) {
                    return memo;
                }
                
                if (chunkName) {
                    const value = chunkName.replace(this.opts.stripContent, '').replace(/\\/g, '/');
                    const key = value + '.' + this.getFileType(file)
                    memo[key] = value;
                } else {
                    memo[file] = file;
                }

                return memo;
            }, memo);
        }, {}));

        // module assets don't show up in assetsByChunkName.
        // we're getting them this way;
        _.merge(manifest, stats.assets.reduce((memo, asset) => {
            const name = this.moduleAssets[asset.name];
            if (name) {
                memo[name] = asset.name;
            }
            return memo;
        }, {}));

        // Append optional basepath onto all references.
        // This allows output path to be reflected in the manifest.
        if (this.opts.basePath) {
            manifest = _.reduce(manifest, (memo, value, key) => {
                memo[this.opts.basePath + key] = this.opts.basePath + value;
                return memo;
            }, {});
        } else if (this.opts.publicPath) {
            // Similar to basePath but only affects the value (similar to how
            // output.publicPath turns require('foo/bar') into '/public/foo/bar', see
            // https://github.com/webpack/docs/wiki/configuration#outputpublicpath
            manifest = _.reduce(manifest, (memo, value, key) => {
                memo[key] = this.opts.publicPath + value;
                return memo;
            }, {});
        }

        Object
            .keys(manifest)
            .sort()
            .forEach(key => this.opts.cache[key] = manifest[key]);    

        const json = JSON.stringify(this.opts.cache, null, 2);
        compilation.assets[this.opts.fileName] = {source: () => json, size: () => json.length};

        if (this.opts.writeToFileEmit) {
            var outputFolder = compilation.options.output.path;
            var outputFile = path.join(outputFolder, this.opts.fileName);

            fse.outputFileSync(outputFile, json);
        }

        compileCallback();
    }
}

module.exports = ManifestWebpackPlugin;
