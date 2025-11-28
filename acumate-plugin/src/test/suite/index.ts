import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
	const mocha = new Mocha({ ui: 'bdd', color: true });
	const testsRoot = path.resolve(__dirname, '.');

	return new Promise((resolve, reject) => {
		glob('**/**.test.js', { cwd: testsRoot })
			.then(files => {
				for (const f of files) {
					mocha.addFile(path.resolve(testsRoot, f));
				}

				try {
					mocha.run(failures => {
						if (failures > 0) {
							reject(new Error(`${failures} tests failed.`));
						} else {
							resolve();
						}
					});
				} catch (err) {
					reject(err);
				}
			})
			.catch(err => reject(err));
	});
}
