import * as path from 'path';
import { fileURLToPath } from 'url';
import Mocha from 'mocha';
import * as glob from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000,
    });

    const testsRoot = __dirname;

    return new Promise((resolve, reject) => {
        // Find all test files
        const testFiles = glob.sync('**/**.test.js', { cwd: testsRoot });

        // Add files to the test suite
        testFiles.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

        try {
            // Run the mocha test
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}
