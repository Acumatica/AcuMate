import vscode from 'vscode';

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
import Handlebars from 'handlebars';
import { createScreen } from './create-screen/create-screen';


export function activate(context: vscode.ExtensionContext) {
	init(context);

	let buildCommandsCache: CommandsCache;

	let disposable = vscode.commands.registerCommand('acumate.createScreen', async () => {
		createScreen();
	});

	disposable = vscode.commands.registerCommand('acumate.buildMenu', async () => {
		const command = await openBuildMenu();
		if (command) {
			vscode.commands.executeCommand(command);
		}
	});

	disposable = vscode.commands.registerCommand('acumate.buildScreensDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				devMode: true,
				cache: buildCommandsCache,
			})
		};
	});

	disposable = vscode.commands.registerCommand('acumate.buildScreens', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				cache: buildCommandsCache,
			})
		};
	});

	disposable = vscode.commands.registerCommand('acumate.buildScreensByNamesDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				devMode: true,
				byNames: true,
				cache: buildCommandsCache,
			})
		};
	});

	disposable = vscode.commands.registerCommand('acumate.buildScreensByNames', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				byNames: true,
				cache: buildCommandsCache,
			})
		};
	});

	disposable = vscode.commands.registerCommand('acumate.buildScreensByModulesDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				devMode: true,
				byModules: true,
				cache: buildCommandsCache,
			})
		};
	});

	disposable = vscode.commands.registerCommand('acumate.buildScreensByModules', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				byModules: true,
				cache: buildCommandsCache,
			})
		};
	});

	disposable = vscode.commands.registerCommand('acumate.buildCurrentScreenDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				currentScreen: true,
				devMode: true,
			})
		};
	});

	disposable = vscode.commands.registerCommand('acumate.buildCurrentScreen', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				currentScreen: true,
			})
		};
	});

	disposable = vscode.commands.registerCommand('acumate.repeatLastBuildCommand', async () => {
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

	disposable = vscode.commands.registerCommand('acumate.dropCache', async () => {
		context.globalState.keys().forEach(key => context.globalState.update(key, undefined));
	});


	context.subscriptions.push(disposable);
}

function init(context: vscode.ExtensionContext) {
	AcuMateContext.ConfigurationService = new ConfigurationService();
	const cacheService = new CachedDataService(context.globalState);
	const apiClient = new AcuMateApiClient();
	AcuMateContext.ApiService = new LayeredDataService(cacheService, apiClient);

}



export function deactivate() {}
