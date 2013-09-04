var fs = require('fs');
var path = require('path');
var im = require('imagemagick');
var async = require('async');

var startTime = null;

process.on('uncaughtException', function(err) {
	console.error('Uncaught exception: ' + err);
	process.exit(1);
});

var configFile = path.join(__dirname, '..', 'config.json');
var config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

var moduleImageMagickFolder = config.imagemagick;
var srcBaseFolder = config.image_source;
var destBaseFolder = config.image_dest;
if (!moduleImageMagickFolder || moduleImageMagickFolder == '') {
	console.error('Module ImageMagick folder is not assigned.');
	process.exit(1);
} else if (!srcBaseFolder || srcBaseFolder == '') {
	console.error('Source image folder is not assigned.');
	process.exit(1);
} else if (!destBaseFolder || destBaseFolder == '') {
	console.error('Dest image folder is not assigned.');
	process.exit(1);
}

process.env.PATH = process.env.PATH + ':' + moduleImageMagickFolder + '/bin';
process.env.DYLD_LIBRARY_PATH = moduleImageMagickFolder + '/lib';

console.log('Loading configuration...');
//console.log('moduleImageMagickFolder: %s', moduleImageMagickFolder);
//console.log('srcBaseFolder: %s', srcBaseFolder);
//console.log('destBaseFolder: %s', destBaseFolder);
//console.log('Path: %s', process.env.PATH);
//console.log('DYLD_LIBRARY_PATH: %s', process.env.DYLD_LIBRARY_PATH);
console.log(config);
console.log();

process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdout.write("Please review and press enter to continue or other keys to exit:");
process.stdin.once('data', function(chunk) {
	if (chunk == '\n') {
		startTime = new Date();
		console.log('Execution started at: %s', startTime.toISOString());
		handleFolder('/');
	} else {
		process.exit(0);
	}
});

function handleFolder(relativeFolder) {
	var srcFolder = srcBaseFolder + relativeFolder;
	var destFolder = destBaseFolder + relativeFolder;
	fs.readdir(srcFolder, function(err, files) {
		if (err) {
			console.log('Read dir error in %s', srcFolder);
			console.error(err);
			process.exit(1);
		} else {
			for ( var i = 0; i < files.length; i++) {
				var file = files[i];
				var srcFile = srcFolder + file;
				var srcFileStat = fs.lstatSync(srcFile);
				if (srcFileStat.isDirectory()) {
					var newRelativeFolder = relativeFolder + file;
					var newDestFolder = destFolder + file;
					handleFolder(newRelativeFolder + '/');
					try {
						fs.mkdirSync(newDestFolder);
					} catch (err) {
						if (err.code != 'EEXIST') {
							console.log('mkdir error in %s', newDestFolder);
							console.error(err);
						}
					}
				} else if (srcFileStat.isFile()) {
					// if (file.match(/[JPG,jpg,Jpg]$/)) {
					var srcFile = srcFolder + file;
					var destFile = destFolder + file;
					filesHandlingQueue.push({
						srcFile : srcFile,
						destFile : destFile
					});
					// }
				}
			}
		}
	});
}

function handleFile(srcFile, destFile, callback) {
	im.identify(srcFile, function(err, features) {
		if (err) {
			// console.log('Image identification error in %s', srcFile);
			// console.error(err);
			callback();
		} else {
			console.log('filename: %s, width: %s, height: %s', features.artifacts.filename, features.width, features.height);
			// console.log(features);
			if (features.width > features.height && features.width > config.resize_to) {
				console.log('cutting width to %d for %s', config.resize_to, features.artifacts.filename);
				im.resize({
					srcPath : srcFile,
					dstPath : destFile,
					width : 1280
				}, function(err, stdout, stderr) {
					if (err) {
						console.log('Image resize error from %s to %s', srcFile, destFile);
						console.error(err);
					}
					callback();
				});
			} else if (features.height > config.resize_to) {
				console.log('cutting height to %d for %s', config.resize_to, features.artifacts.filename);
				im.resize({
					srcPath : srcFile,
					dstPath : destFile,
					height : 1280
				}, function(err, stdout, stderr) {
					if (err) {
						console.log('Image resize error from %s to %s', srcFile, destFile);
						console.error(err);
					}
					callback();
				});
			} else {
				console.log('copying directly from %s to %s...', srcFile, destFile);
				fs.createReadStream(srcFile).pipe(fs.createWriteStream(destFile));
				callback();
			}
		}
	});
}

var filesHandlingQueue = async.queue(function(task, callback) {
	handleFile(task.srcFile, task.destFile, function() {
		callback();
	});
}, config.queue_size);

filesHandlingQueue.drain = function() {
	var endTime = new Date();
	var timeConsuming = (endTime - startTime)/1000;
	console.log('All done! %s', endTime.toISOString());
	console.log('Time consuming: %s secs', timeConsuming);
	setTimeout(function() {
		process.exit(0);
	}, 1000);
};
