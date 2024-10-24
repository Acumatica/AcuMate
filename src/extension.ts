import { ExtensionContext, commands, workspace } from 'vscode';

import { CachedDataService } from './api/cached-data-service';
import { AcuMateApiClient } from './api/api-service';
import { AcuMateContext } from './plugin-context';
import { LayeredDataService } from './api/layered-data-service';
import { ConfigurationService } from './services/configuration-service';

import { setScreenName } from './create-screen/set-screen-name';
import { selectGraphType } from './create-screen/select-graph-type';
import { selectViews } from './create-screen/select-views';
import { setPrimaryView } from './create-screen/set-primary-view';
import { setViewTypes } from './create-screen/set-view-types';
import { selectFields } from './create-screen/select-fields';

import { buildScreens, CommandsCache, openBuildMenu } from './build-commands/build-screens';


export function activate(context: ExtensionContext) {
	init(context);
	// Access the configuration for your plugin
	const config = workspace.getConfiguration('myPlugin');

	// Read the settings
	const someSetting = config.get('someSetting');
	const isFeatureEnabled = config.get('enableFeature');
	const numberSetting = config.get('numberSetting');
  
	console.log('Setting value:', someSetting);
	console.log('Is feature enabled:', isFeatureEnabled);
	console.log('Number setting:', numberSetting);
  
	// Example of using a setting in your plugin's logic
	if (isFeatureEnabled) {
	  // Do something if the feature is enabled
	}

	let buildCommandsCache: CommandsCache;
	let disposable;

	disposable = commands.registerCommand('acumate.createScreen', async () => {
		const screenId = await setScreenName();
		const graphType = await selectGraphType();
		if (!graphType) {
			return;
		}
		const views = await selectViews(graphType);
		if (!views) {
			return;
		}
		const primaryView = await setPrimaryView(views);
		await setViewTypes(views);
		await selectFields(views);
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildMenu', async () => {
		const command = await openBuildMenu();
		if (command) {
			commands.executeCommand(command);
		}
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildScreensDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				devMode: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildScreens', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildScreensByNamesDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				devMode: true,
				byNames: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildScreensByNames', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				byNames: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildScreensByModulesDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				devMode: true,
				byModules: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildScreensByModules', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				byModules: true,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildCurrentScreenDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				currentScreen: true,
				devMode: true,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.buildCurrentScreen', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				currentScreen: true,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.repeatLastBuildCommand', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				noPrompt: true,
				byNames: buildCommandsCache.byNames,
				byModules: buildCommandsCache.byModules,
				cache: buildCommandsCache,
			})
		};
	});
	context.subscriptions.push(disposable);

	disposable = commands.registerCommand('acumate.dropCache', async () => {
		context.globalState.keys().forEach(key => context.globalState.update(key, undefined));
	});
	context.subscriptions.push(disposable);
}

function init(context: ExtensionContext) {
	const cacheService = new CachedDataService(context.globalState);
	const apiClient = new AcuMateApiClient();
	AcuMateContext.ApiService = new LayeredDataService(cacheService, apiClient);

	AcuMateContext.ConfigurationService = new ConfigurationService();
}

export function deactivate() {}
