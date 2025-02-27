/*
Copyright 2017 The Nuclio Authors.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
//
// ******* Configuration and loading third party components *******
//

/**
 * Load required components
 */

// Do not put here required modules that are in devDependencies in package.json, instead require them only in the
// specific gulp task that uses them (for example: karma, protractor, livereload)
var babel = require('gulp-babel');
var color = require('ansi-colors');
var config = require('./build.config');
var cache = require('gulp-file-transform-cache');
var gulp = require('gulp');
var path = require('path');
var less = require('gulp-less');
var lessImport = require('gulp-less-import');
var log = require('fancy-log');
var rename = require('gulp-rename');
var concat = require('gulp-concat');
var runSequence = require('run-sequence');
var eslint = require('gulp-eslint');
var preprocess = require('gulp-preprocess');
var minifyCss = require('gulp-clean-css');
var gulpIf = require('gulp-if');
var rev = require('gulp-rev');
var argv = require('yargs').argv;
var minifyHtml = require('gulp-htmlmin');
var ngHtml2Js = require('gulp-ng-html2js');
var merge2 = require('merge2');
var uglify = require('gulp-uglify');
var revCollector = require('gulp-rev-collector');
var imagemin = require('gulp-imagemin');
var iRequire = require('./resources/installRequire');
var lodash = require('lodash');
var del = require('del');
var vinylPaths = require('vinyl-paths');
var exec = require('child_process').exec;
var errorHandler = require('gulp-error-handle');
var buildVersion = null;
var livereload = null;

/**
 * Set up configuration
 */
var state = {
    isDevMode: argv.dev === true, // works only for development build type
    isForTesting: false,
    isForE2ETesting: false
};

/**
 * Load components for development environment
 */
if (state.isDevMode) {
    livereload = require('gulp-livereload');
}

/**
 * Make sure resources are built before app
 */
var previewServer = iRequire(config.resources.previewServer);

//
// ******* Tasks *******
//

/**
 * Set build for testing
 */
gulp.task('set-testing', function () {
    state.isForTesting = true;
    state.isDevMode = true;
});

/**
 * Set build for testing
 */
gulp.task('set-e2e-testing', function () {
    state.isForE2ETesting = true;
    //state.isDevMode = true;
});

/**
 * Clean build directory
 */
gulp.task('clean', function () {
    return gulp.src([config.build_dir, config.cache_file])
        .pipe(errorHandler(handleError))
        .pipe(vinylPaths(del));
});

/**
 * Build vendor.css (include all vendor css files)
 */
gulp.task('vendor.css', function () {
    var distFolder = config.assets_dir + '/css';

    return merge2(
        gulp.src(config.vendor_files.less)
            .pipe(errorHandler(handleError))
            .pipe(lessImport('bootstrap.less'))
            .pipe(less()),
        gulp.src([path.join(distFolder, 'bootstrap.css')].concat(config.vendor_files.css)))
        .pipe(errorHandler(handleError))
        .pipe(concat(config.output_files.vendor.css))
        .pipe(gulpIf(!state.isDevMode, minifyCss()))
        .pipe(gulpIf(!state.isDevMode, rev()))
        .pipe(gulp.dest(distFolder))
        .pipe(gulpIf(!state.isDevMode, rev.manifest(config.output_files.vendor.css_manifest)))
        .pipe(gulp.dest(distFolder));
});

/**
 * Build vendor.js (include all vendor js files)
 */
gulp.task('vendor.js', function () {
    var distFolder = config.assets_dir + '/js';

    return gulp.src(config.vendor_files.js)
        .pipe(errorHandler(handleError))
        .pipe(concat(config.output_files.vendor.js))
        .pipe(gulpIf(!state.isDevMode, uglify()))
        .pipe(gulpIf(!state.isDevMode, rev()))
        .pipe(gulp.dest(distFolder))
        .pipe(gulpIf(!state.isDevMode, rev.manifest(config.output_files.vendor.js_manifest)))
        .pipe(gulp.dest(distFolder));
});

/**
 * Build app.css (include all project css files)
 */
gulp.task('app.css', function () {
    var distFolder = config.assets_dir + '/css';

    var task = gulp
        .src(config.app_files.less_files)
        .pipe(errorHandler(handleError))
        .pipe(lessImport('app.less'))
        .pipe(less({
            paths: [path.join(__dirname, 'less', 'includes')],
            compress: false
        }))
        .pipe(less({
            compress: !state.isDevMode
        }))
        .pipe(rename(config.output_files.app.css))
        .pipe(gulpIf(!state.isDevMode, rev()))
        .pipe(gulp.dest(distFolder))
        .pipe(gulpIf(!state.isDevMode, rev.manifest(config.output_files.app.css_manifest)))
        .pipe(gulp.dest(distFolder));

    if (livereload !== null) {
        task.pipe(livereload());
    }

    return task;
});

/**
 * Build app.js (include all project js files and templates)
 */
gulp.task('app.js', function () {
    var distFolder = config.assets_dir + '/js';
    var customConfig = buildConfigFromArgs();

    var js = gulp.src(config.app_files.js)
        .pipe(errorHandler(handleError))
        .pipe(preprocess({
            context: {
                IGZ_CUSTOM_CONFIG: customConfig || '',
                IGZ_TESTING: state.isForTesting,
                IGZ_E2E_TESTING: state.isForE2ETesting,
                IGZ_DEVELOPMENT_BUILD: state.isDevMode
            }
        }))
        .pipe(cache({
            path: config.cache_file,
            transformStreams: [
                babel({
                    ignore: ['node_modules/iguazio.dashboard-controls/dist/js/iguazio.dashboard-controls.js']
                })
            ]
        }));

    var templates = gulp.src(config.app_files.templates)
        .pipe(errorHandler(handleError))
        .pipe(minifyHtml({
            removeComments: true,
            collapseWhitespace: true,
            collapseInlineTagWhitespace: true,
            conservativeCollapse: true
        }))
        .pipe(ngHtml2Js({
            moduleName: config.app_files.templates_module_name
        }));

    var task;

    if (state.isForTesting) {
        task = merge2(js, templates)
            .pipe(errorHandler(handleError))
            .pipe(concat(config.output_files.app.js))
            .pipe(gulp.dest(distFolder));
    } else {
        task = merge2(js, templates)
            .pipe(errorHandler(handleError))
            .pipe(concat(config.output_files.app.js))
            .pipe(gulpIf(!state.isDevMode, rev()))
            .pipe(gulp.dest(distFolder))
            .pipe(gulpIf(!state.isDevMode, rev.manifest(config.output_files.app.js_manifest)))
            .pipe(gulp.dest(distFolder));
    }

    if (state.isDevMode && livereload !== null) {
        task.pipe(livereload());
    }

    return task;
});

/**
 * Temporary task to copy the monaco-editor files to the assets directory
 */
gulp.task('monaco', function () {
    gulp.src(['node_modules/monaco-editor/**/*']).pipe(gulp.dest(config.assets_dir + '/monaco-editor'));
});

/**
 * Copy all fonts to the build directory
 */
gulp.task('fonts', function () {
    var distFolder = config.assets_dir + '/fonts';

    return gulp.src(config.app_files.fonts + '/**/*')
        .pipe(errorHandler(handleError))
        .pipe(gulp.dest(distFolder));
});

/**
 * Optimize all images and copy them to the build directory
 */
gulp.task('images', function () {
    var distFolder = config.assets_dir + '/images';

    return gulp.src(config.app_files.images)
        .pipe(errorHandler(handleError))
        .pipe(gulpIf(!state.isDevMode, imagemin({
            optimizationLevel: 3,
            progressive: true,
            interlaced: true
        })))
        .pipe(gulp.dest(distFolder));
});

/**
 * Copy all translation files to the build directory
 */
gulp.task('i18n', function () {
    var distFolder = config.assets_dir + '/i18n';

    return gulp.src(config.app_files.i18n)
        .pipe(errorHandler(handleError))
        .pipe(gulp.dest(distFolder));
});

/**
 * Build index.html for ordinary use
 */
gulp.task('index.html', function () {
    return buildIndexHtml(false);
});

/**
 * Build dashboard-config.json
 */
gulp.task('dashboard-config.json', function () {
    return gulp.src(config.app_files.json)
        .pipe(errorHandler(handleError))
        .pipe(gulp.dest(config.build_dir));
});

/**
 * Lint source code
 */
gulp.task('lint', function () {
    return gulp.src(config.app_files.js)
        .pipe(errorHandler(handleError))
        .pipe(eslint())
        .pipe(eslint.format('compact'))
        .pipe(eslint.failAfterError());
});

/**
 * Serve static files
 */
gulp.task('serve-static', function () {
    previewServer.start(log, config.build_dir);
});

/**
 * Run unit tests (Karma)
 * Task for development environment only
 */
gulp.task('test-unit-run', function (done) {
    var KarmaServer = require('karma').Server;
    var files = [__dirname + '/' + config.assets_dir + '/js/' + config.output_files.vendor.js]
        .concat(__dirname + '/' + config.test_files.unit.vendor)
        .concat([__dirname + '/' + config.assets_dir + '/js/' + config.output_files.app.js])
        .concat(__dirname + '/' + (!lodash.isUndefined(argv.spec) ? 'src/**/' + argv.spec : config.test_files.unit.tests));

    new KarmaServer({
        configFile: __dirname + '/' + config.test_files.unit.karma_config,
        files: files,
        action: 'run'
    }, done).start();
});

/**
 * Build e2e mock module with dependencies
 */
gulp.task('test-e2e-mock-module', function () {
    var files = config.test_files.e2e.vendor
        .concat(config.test_files.e2e.mock_module);

    return gulp.src(files)
        .pipe(errorHandler(handleError))
        .pipe(concat(config.test_files.e2e.built_file_name))
        .pipe(gulp.dest(config.test_files.e2e.built_folder_name));
});

/**
 * Process index.html and inject mocked module for e2e testing
 */
gulp.task('test-e2e-mock-html', function () {
    return buildIndexHtml(true);
});

/**
 * Print info about test-e2e-run task options
 * Task for development environment only
 */
gulp.task('e2e-help', function () {
    var greenColor = '\x1b[32m';
    var regularColor = '\x1b[0m';
    var helpMessage = '\n' +
        greenColor + '--browsers={number}' + regularColor + '\n\toption for setting count of browser instances to run\n' +
        greenColor + '--run-single' + regularColor + '\n\toption for running all specs in one thread\n' +
        greenColor + '--specs={string}' + regularColor + '\n\tcomma separated set of specs for test run.\n\tSee: ./build.config -> test_files.e2e.spec_path\n' +
        greenColor + '--spec-pattern={string}' + regularColor + '\n\tcomma separated set of spec patterns for including to test run\n' +
        greenColor + '--exclude-pattern={string}' + regularColor + '\n\tcomma separated set of spec patterns for excluding from test run\n' +
        greenColor + '--junit-report' + regularColor + '\n\toption for generating test reporter in XML format that is compatible with JUnit\n' +
        greenColor + '--dont-update-wd' + regularColor + '\n\toption to prevent WebDriver updating';
    console.info(helpMessage);
});

/**
 * Run e2e tests (Protractor)
 * Task for development environment only
 */
gulp.task('test-e2e-run', function () {
    console.info('Use \'gulp e2e-help\' to get info about test run options');
    var argumentList = [];
    var src = [];
    var browserInstances = 3;
    var exclusions = [];
    var protractor = require('gulp-protractor').protractor;

    /**
     * --browsers={number} - option for setting count of browser instances to run
     * @type {number}
     */
    if (argv['browsers']) {
        browserInstances = parseInt(argv['browsers']);
    }

    if (argv['demo']) {
        argumentList.push(
            '--params.use_mode=demo'
        );
    } else {
        argumentList.push(
            '--params.use_mode=staging'
        );
    }

    /**
     * --run-single - option for running all specs in one thread
     */
    if (!argv['run-single']) {
        argumentList.push(
            '--capabilities.maxInstances', browserInstances,
            '--capabilities.shardTestFiles', true
        );
    }

    /**
     * --specs={string} - comma separated list of specs for test run.
     * See: ./build.config -> test_files.e2e.spec_path
     * @type {string}
     */
    if (argv.specs) {
        argv.specs.split(',').forEach(function (specArgument) {
            src.push(config.test_files.e2e.spec_path[specArgument.trim()]);
        });
    }

    /**
     * --spec-pattern={string} - comma separated list of spec patterns for including to test run
     * @type {string}
     */
    if (argv['spec-pattern']) {
        argv['spec-pattern'].split(',').forEach(function (specPattern) {
            src.push(config.test_files.e2e.specs_location + specPattern.trim() + '.spec.js');
        });
        console.info('Ran specs:\n' + src.join(',\n'));
    }

    /**
     * --exclude-pattern={string} - comma separated list of spec patterns for excluding from test run
     * @type {string}
     */
    if (argv['exclude-pattern']) {
        argv['exclude-pattern'].split(',').forEach(function (excludePattern) {
            exclusions.push(config.test_files.e2e.specs_location + excludePattern.trim() + '.spec.js');
        });
        argumentList.push(
            '--exclude', exclusions.join(',')
        );
        console.info('Excluded specs:\n' + exclusions.join(',\n'));
    }

    /**
     * --junit-report - option for generating test reporter in XML format that is compatible with JUnit
     */
    if (argv['junit-report']) {
        argumentList.push(
            '--params.use_junit_reporter=true'
        );
        console.info('JUnit reporter will be used');
    }

    return gulp.src(src)
        .pipe(protractor({
            configFile: config.test_files.e2e.protractor_config,
            args: argumentList
        }))
        .on('error', function (e) {
            var currentTime = new Date();
            console.error('[' + currentTime.getHours() + ':' + currentTime.getMinutes() + ':' +
                currentTime.getSeconds() + '] ');
            throw e;
        });
});

/**
 * Stop the server
 */
gulp.task('stop-server', function (next) {
    previewServer.stop();
    next();
});

/**
 * Watch for changes and build needed sources
 * Task for development environment only
 */
gulp.task('watcher', function () {
    state.isDevMode = true;
    if (livereload !== null) {
        livereload.listen();
    }

    gulp.watch(config.app_files.less_files, function () {
        return runSequence('app.css');
    });
    log('Watching', color.yellow('LESS'), 'files');

    var appFiles = config.app_files.js
        .concat(config.app_files.templates);
    gulp.watch(appFiles, function () {
        return runSequence('app.js');
    });
    log('Watching', color.yellow('JavaScript'), 'files');

    gulp.watch(config.app_files.html, function () {
        return runSequence('index.html');
    });
    log('Watching', color.yellow('HTML'), 'files');

    gulp.watch(config.app_files.json, function () {
        return runSequence('dashboard-config.json');
    });
    log('Watching', color.blue('JSON'), 'files');

    gulp.watch(config.app_files.i18n, {interval: 3000}, function () {
        return runSequence('i18n');
    });
    log('Watching', color.blue('I18N'), 'files');

    gulp.watch(config.shared_files.less, function () {
        return runSequence('build_shared');
    });
    log('Watching', color.yellow('LESS'), 'shared_files');

    var appFilesShared = config.shared_files.js
        .concat(config.shared_files.templates);
    gulp.watch(appFilesShared, function () {
        return runSequence('build_shared');
    });
    log('Watching', color.yellow('JavaScript'), 'shared_files');

    gulp.watch(config.shared_files.i18n, {interval: 3000}, function () {
        return runSequence('build_shared');
    });
    log('Watching', color.blue('I18N'), 'shared_files');
});

/**
 * Update web driver
 * Task for development environment only
 */
gulp.task('update-web-driver', function (next) {
    var webDriverUpdate = require('gulp-protractor').webdriver_update;
    argv['dont-update-wd'] ? next() : webDriverUpdate(next);
});

//
// ******* Common parts *******
//

/**
 * Build index.html
 */
function buildIndexHtml(isVersionForTests) {
    var task = gulp.src([config.app_files.html, config.assets_dir + '/**/*.manifest.json'])
        .pipe(errorHandler(handleError))
        .pipe(gulpIf(!state.isDevMode, revCollector()))
        .pipe(gulpIf(isVersionForTests, preprocess({context: {IGZ_TEST_E2E: true}}), preprocess()))
        .pipe(gulpIf(!state.isDevMode, minifyHtml({
            removeComments: true,
            collapseWhitespace: true,
            collapseInlineTagWhitespace: true,
            conservativeCollapse: true
        })))
        .pipe(gulp.dest(config.build_dir));

    if (livereload !== null) {
        task.pipe(livereload());
    }

    return task;
}

function buildConfigFromArgs() {
    var buildConfig = {
        mode: argv['demo']    === true ? 'demo'       : // demo overrides staging in case of: `gulp --demo --staging`
              argv['staging'] === true ? 'staging'    :
              /* default */              'production'
    };

    if (state.isDevMode) {
        buildConfig.i18nextExpirationTime = 0;
    }

    // if at least one URL was set, create the config
    // eslint-disable-next-line
    return !lodash.isEmpty(buildConfig) ? JSON.stringify(buildConfig) : null;
}

//
// ******* Task chains *******
//

/**
 * Base build task
 */
gulp.task('build', function (next) {
    runSequence('lint', 'clean', ['vendor.css', 'vendor.js'], ['app.css', 'app.js', 'fonts', 'images', 'i18n', 'monaco'], 'index.html', 'dashboard-config.json', next);
});

/**
 * Task for unit test running
 * Task for development environment only
 */
gulp.task('test-unit', function (next) {
    runSequence('set-testing', 'build', 'serve-static', 'stop-server', 'test-unit-run', next);
});

/**
 * Task for e2e test running
 * Task for development environment only
 */
gulp.task('test-e2e', function (next) {
    runSequence('e2e-help', 'update-web-driver', 'set-e2e-testing', 'build', 'serve-static', 'test-e2e-mock-module', 'test-e2e-mock-html',
                'test-e2e-run', 'stop-server', next);
});

/**
 * Task for unit and e2e test running (run without tags, using simple state mode)
 * Task for development environment only
 */
gulp.task('test', function (next) {
    runSequence('test-unit', 'test-e2e', next);
});

/**
 * Lifts up preview server
 * This could be used to quickly use dashboard when it is already built.
 */
gulp.task('lift', function (next) {
    var mocks = ['serve-static'];

    runSequence(mocks, next);
});

/**
 * Default task
 */
gulp.task('default', function (next) {
    runSequence(['clean_shared', 'build_shared'], 'build', 'lift', next);
});

/**
 * Build project, watch for changes and build needed sources
 * Task for development environment only
 */
gulp.task('watch', function (next) {
    state.isDevMode = true;
    runSequence('default', 'watcher', next);
});

//
// Shared
//

/**
 * Clean build directory
 */
gulp.task('clean_shared', function () {
    if (state.isDevMode) {
        return gulp.src(config.shared_files.dist)
            .pipe(errorHandler(handleError))
            .pipe(vinylPaths(del));
    }
});

/**
 * Build shared less file (include all shared less files)
 */
gulp.task('app.less_shared', function () {
    var distFolder = config.shared_files.dist + '/less';

    var appLess = gulp
        .src(config.shared_files.less)
        .pipe(errorHandler(handleError))
        .pipe(concat(config.shared_output_files.app.less))
        .pipe(gulp.dest(distFolder));

    var vendorLess = gulp
        .src(config.shared_files.vendor.less)
        .pipe(errorHandler(handleError))
        .pipe(concat(config.shared_output_files.vendor.less))
        .pipe(gulp.dest(distFolder));

    return merge2(appLess, vendorLess);
});

/**
 * Build app.js (include all project js files and templates)
 */
gulp.task('app.js_shared', function () {
    var distFolder = config.shared_files.dist + '/js';

    var js = gulp.src(config.shared_files.js)
        .pipe(errorHandler(handleError))
        .pipe(cache({
            path: config.shared_cache_file,
            transformStreams: [
                babel()
            ]
        }));

    var vendorJs = gulp.src(config.shared_files.vendor.js)
        .pipe(errorHandler(handleError))
        .pipe(concat(config.shared_output_files.vendor.js))
        .pipe(gulp.dest(distFolder));

    var templates = gulp.src(config.shared_files.templates)
        .pipe(errorHandler(handleError))
        .pipe(minifyHtml({
            removeComments: true,
            collapseWhitespace: true,
            collapseInlineTagWhitespace: true,
            conservativeCollapse: true
        }))
        .pipe(ngHtml2Js({
            moduleName: config.shared_files.templates_module_name
        }));

    var task = merge2(js, templates)
        .pipe(errorHandler(handleError))
        .pipe(concat(config.shared_output_files.app.js))
        .pipe(gulp.dest(distFolder));

    return merge2(task, vendorJs);
});

/**
 * Copy all fonts to the build directory
 */
gulp.task('fonts_shared', function () {
    var distFolder = config.shared_files.dist + '/fonts';

    return gulp.src(config.shared_files.fonts)
        .pipe(errorHandler(handleError))
        .pipe(gulp.dest(distFolder));
});

/**
 * Copy all translation files to the build directory
 */
gulp.task('i18n_shared', function () {
    var distFolder = config.shared_files.dist + '/i18n';

    return gulp.src(config.shared_files.i18n)
        .pipe(errorHandler(handleError))
        .pipe(gulp.dest(distFolder));
});

/**
 * Optimize all images and copy them to the build directory
 */
gulp.task('images_shared', function () {
    var distFolder = config.shared_files.dist + '/images';

    return gulp.src(config.shared_files.images)
        .pipe(errorHandler(handleError))
        .pipe(imagemin({
            optimizationLevel: 3,
            progressive: true,
            interlaced: true
        }))
        .pipe(gulp.dest(distFolder));
});

/**
 * Lint source code
 */
gulp.task('lint_shared', function () {
    return gulp.src(config.shared_files.js)
        .pipe(errorHandler(handleError))
        .pipe(eslint())
        .pipe(eslint.format('compact'))
        .pipe(eslint.failAfterError());
});

gulp.task('inject-version_shared', function () {
    exec('git describe --tags --abbrev=40', function (err, stdout) {
        buildVersion = stdout;
    });
});

//
// ******* Task chains *******
//

/**
 * Base build task
 */
gulp.task('build_shared', function (next) {
    if (state.isDevMode) {
        runSequence('lint_shared', 'inject-version_shared', ['app.less_shared', 'app.js_shared', 'fonts_shared', 'images_shared', 'i18n_shared'], next);
    } else {
        next();
    }
});

//
// Helper methods
//

/**
 * Error handler.
 * @param {Object} error
 */
function handleError(error) {
    console.error(error.message);

    process.exit(1);
}
