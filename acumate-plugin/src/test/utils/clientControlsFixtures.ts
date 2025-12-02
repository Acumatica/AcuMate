import * as fs from "fs";
import * as path from "path";
import * as tar from "tar";

let preparePromise: Promise<void> | undefined;

export function ensureClientControlsFixtures(): Promise<void> {
	if (!preparePromise) {
		preparePromise = prepareClientControlsFixtures();
	}
	return preparePromise;
}

async function prepareClientControlsFixtures(): Promise<void> {
	const archivePath = path.resolve(__dirname, "../../..", "src", "test", "client-controls.tgz");
	const nodeModulesTarget = path.resolve(
		__dirname,
		"../../..",
		"src",
		"test",
		"fixtures",
		"client-controls-project",
		"node_modules",
		"client-controls"
	);
	const inlineTarget = path.resolve(
		__dirname,
		"../../..",
		"src",
		"test",
		"fixtures",
		"client-controls-inline-project",
		"client-controls"
	);
	const sharedFixtureTarget = path.resolve(
		__dirname,
		"../../..",
		"src",
		"test",
		"fixtures",
		"client-controls"
	);

	await ensureClientControlsPackage(nodeModulesTarget, archivePath);
	await ensureClientControlsPackage(inlineTarget, archivePath);
	await ensureClientControlsPackage(sharedFixtureTarget, archivePath);
}

async function ensureClientControlsPackage(targetDir: string, archivePath: string): Promise<void> {
	const sentinelPath = path.join(targetDir, "client-controls.d.ts");
	if (fs.existsSync(sentinelPath)) {
		return;
	}

	if (!fs.existsSync(archivePath)) {
		throw new Error(`Missing client controls archive at ${archivePath}`);
	}

	await fs.promises.rm(targetDir, { recursive: true, force: true });
	await fs.promises.mkdir(targetDir, { recursive: true });
	await tar.x({ file: archivePath, cwd: targetDir, strip: 1 });
}
