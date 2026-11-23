import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sinon from 'sinon';
import vscode from 'vscode';
import { describe, it, before, beforeEach, afterEach } from 'mocha';
import {
	getClassPropertiesFromTs,
	getScreenTsFromExtension,
	resolveFrontendSourcesUri,
	resolveModulePath,
	tryGetGraphTypeFromExtension,
} from '../../utils';
import { resolveBaseScreenHtmlPath } from '../../services/screen-html-service';
import { validateHtmlFile } from '../../validation/htmlValidation/html-validation';
import { AcuMateContext } from '../../plugin-context';
import { CachedDataService } from '../../api/cached-data-service';
import { AcuMateApiClient } from '../../api/api-service';
import { GraphAPICache } from '../../api/constants';
import { ensureClientControlsFixtures } from '../utils/clientControlsFixtures';

const fixturesRoot = path.resolve(__dirname, '../../../src/test/fixtures');
const customizationExtensionTs = path.join(
	fixturesRoot,
	'customizationScreens',
	'SamplePackage',
	'screens',
	'SO',
	'SO301000',
	'extensions',
	'SO301000_CustomExt.ts'
);
const customizationExtensionHtml = path.join(
	fixturesRoot,
	'customizationScreens',
	'SamplePackage',
	'screens',
	'SO',
	'SO301000',
	'extensions',
	'SO301000_CustomExt.html'
);

describe('customizationScreens, src imports, and backend resilience', () => {
	const originalConfig = AcuMateContext.ConfigurationService;
	const originalRepoPath = AcuMateContext.repositoryPath;

	before(function () {
		this.timeout(20000);
		return ensureClientControlsFixtures();
	});

	before(() => {
		if (!AcuMateContext.HtmlValidator) {
			AcuMateContext.HtmlValidator = vscode.languages.createDiagnosticCollection('htmlValidatorCustomizationTest');
		}
	});

	beforeEach(() => {
		AcuMateContext.HtmlValidator?.clear();
	});

	afterEach(() => {
		AcuMateContext.ConfigurationService = originalConfig;
		AcuMateContext.repositoryPath = originalRepoPath;
		sinon.restore();
	});

	it('resolves base screen TS, graphType, and HTML from customizationScreens extensions', () => {
		const baseTs = getScreenTsFromExtension(customizationExtensionTs);
		assert.ok(baseTs, 'Expected base screen TS to resolve from customizationScreens');
		assert.strictEqual(path.basename(baseTs!), 'SO301000.ts');

		const graphType = tryGetGraphTypeFromExtension(customizationExtensionTs);
		assert.strictEqual(graphType, 'PX.SM.ProjectNewUiFrontendFileMaintenance');

		const baseHtml = resolveBaseScreenHtmlPath(customizationExtensionHtml);
		assert.ok(baseHtml, 'Expected base screen HTML to resolve from customizationScreens');
		assert.strictEqual(path.basename(baseHtml!), 'SO301000.html');
	});

	it('validates sequential HTML customization placements in customizationScreens extensions', async () => {
		const document = await vscode.workspace.openTextDocument(customizationExtensionHtml);
		await validateHtmlFile(document);
		const diagnostics = AcuMateContext.HtmlValidator?.get(document.uri) ?? [];
		assert.strictEqual(
			diagnostics.length,
			0,
			`Expected no diagnostics for sequential customization placements, got: ${diagnostics.map(d => d.message).join('; ')}`
		);
	});

	it('resolves src/... TypeScript imports for customization extensions', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acumate-src-import-'));
		try {
			const baseScreenDir = path.join(tempRoot, 'screen', 'src', 'screens', 'SO', 'SO301000');
			const customExtDir = path.join(
				tempRoot,
				'screen',
				'src',
				'customizationScreens',
				'SamplePkg',
				'screens',
				'SO',
				'SO301000',
				'extensions'
			);
			fs.mkdirSync(baseScreenDir, { recursive: true });
			fs.mkdirSync(customExtDir, { recursive: true });

			const baseTsPath = path.join(baseScreenDir, 'SO301000.ts');
			const extTsPath = path.join(customExtDir, 'SO301000_Custom.ts');

			fs.writeFileSync(
				baseTsPath,
				[
					'export class SOOrder extends PXView {',
					'\tOrderNbr!: PXFieldState;',
					'}',
					'export class SO301000 extends PXScreen {',
					'\tDocument = createSingle(SOOrder);',
					'}',
				].join('\n'),
				'utf-8'
			);

			const extContent = [
				'import { SO301000, SOOrder } from "src/screens/SO/SO301000/SO301000";',
				'export interface SOOrder_Custom extends SOOrder {}',
				'export class SOOrder_Custom {',
				'\tUsrCustomField!: PXFieldState;',
				'}',
			].join('\n');
			fs.writeFileSync(extTsPath, extContent, 'utf-8');

			const resolved = resolveModulePath(extTsPath, 'src/screens/SO/SO301000/SO301000');
			assert.strictEqual(path.normalize(resolved ?? ''), path.normalize(baseTsPath));

			const classInfos = getClassPropertiesFromTs(extContent, extTsPath);
			const orderView = classInfos.find(info => info.className === 'SOOrder');
			const orderExt = classInfos.find(info => info.className === 'SOOrder_Custom');
			assert.ok(orderView?.properties.has('UsrCustomField'), 'Expected mixin field merged onto imported SOOrder');
			assert.strictEqual(orderExt?.type, 'PXView', 'Expected PXView type propagated to interface-merged extension');
		}
		finally {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it('resolves FrontendSources URI from a standalone instance path without .git', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acumate-instance-'));
		try {
			const frontendSources = path.join(tempRoot, 'FrontendSources');
			const screenDir = path.join(frontendSources, 'screen', 'src', 'screens');
			fs.mkdirSync(screenDir, { recursive: true });

			AcuMateContext.repositoryPath = undefined;
			const resolved = resolveFrontendSourcesUri(screenDir);
			assert.ok(resolved, 'Expected FrontendSources URI to resolve');
			assert.strictEqual(
				path.normalize(resolved!.fsPath),
				path.normalize(vscode.Uri.file(frontendSources).fsPath)
			);
		}
		finally {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it('scopes CachedDataService entries by backendUrl and tenant', async () => {
		const store = new Map<string, unknown>();
		const memento: vscode.Memento = {
			keys: () => [...store.keys()],
			get: <T>(key: string) => store.get(key) as T,
			update: async (key: string, value: unknown) => {
				if (value === undefined) {
					store.delete(key);
				}
				else {
					store.set(key, value);
				}
			},
		};

		const cacheService = new CachedDataService(memento);

		AcuMateContext.ConfigurationService = {
			useCache: true,
			backedUrl: 'http://localhost/SiteA/',
			tenant: 'Tenant1',
		} as any;
		cacheService.store(GraphAPICache, [{ name: 'GraphA' }]);

		AcuMateContext.ConfigurationService = {
			useCache: true,
			backedUrl: 'http://localhost/SiteB/',
			tenant: 'Tenant1',
		} as any;
		const siteBGraphs = await cacheService.getGraphs();
		assert.strictEqual(siteBGraphs, undefined, 'Expected separate cache namespace for different backendUrl');

		AcuMateContext.ConfigurationService = {
			useCache: true,
			backedUrl: 'http://localhost/SiteA/',
			tenant: 'Tenant1',
		} as any;
		const siteAGraphs = await cacheService.getGraphs();
		assert.strictEqual(siteAGraphs?.[0]?.name, 'GraphA');
	});

	it('stops retrying 404 ui/meta-data/* endpoints and falls back to ui/features on pre-26R1 backends', async () => {
		AcuMateContext.ConfigurationService = {
			useBackend: true,
			backedUrl: 'http://localhost/Legacy25R2/',
			login: 'admin',
			password: '123',
			tenant: '',
		} as any;

		const requestedUrls: string[] = [];
		const makeResponse = (status: number, body?: unknown) => ({
			ok: status >= 200 && status < 300,
			status,
			headers: {
				get: (name: string) => (name.toLowerCase() === 'content-type' && body !== undefined ? 'application/json' : ''),
				getSetCookie: () => [],
			},
			json: async () => body,
			text: async () => (body ? JSON.stringify(body) : ''),
		}) as unknown as Response;

		sinon.stub(globalThis, 'fetch').callsFake(async (input: string | URL | Request) => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.endsWith('entity/auth/login') || url.endsWith('entity/auth/logout')) {
				return makeResponse(204);
			}
			if (url.endsWith('ui/meta-data/features') || url.endsWith('ui/meta-data/graphs')) {
				return makeResponse(404);
			}
			if (url.endsWith('ui/features')) {
				return makeResponse(200, {
					sets: [{ name: 'PX.Objects.CS.FeaturesSet', features: [{ name: 'Inventory', enabled: true }] }],
				});
			}
			return makeResponse(404);
		});

		const client = new AcuMateApiClient();
		const features = await client.getFeatures();
		assert.strictEqual(features?.length, 1);
		assert.strictEqual(features?.[0]?.featureName, 'PX.Objects.CS.FeaturesSet+Inventory');

		const graphs = await client.getGraphs();
		assert.strictEqual(graphs, undefined);
		assert.strictEqual(
			requestedUrls.filter(url => url.endsWith('ui/meta-data/graphs')).length,
			0,
			'Expected ui/meta-data/graphs to be skipped after ui/meta-data/* already returned 404'
		);
	});
});
