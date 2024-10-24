import { ExtensionContext, commands } from 'vscode';

import { setScreenName } from './create-screen/set-screen-name';
import { selectGraphType } from './create-screen/select-graph-type';
import { selectViews } from './create-screen/select-views';
import { setPrimaryView } from './create-screen/set-primary-view';
import { setViewTypes } from './create-screen/set-view-types';
import { selectFields } from './create-screen/select-fields';

import { buildScreens, CommandsCache } from './build-commands/build-screens';


export function activate(context: ExtensionContext) {
	let buildCommandsCache: CommandsCache;

	let disposable = commands.registerCommand('acumate.createScreen', async () => {
		const screenId = await setScreenName();
		const graphType = await selectGraphType();
		const views = await selectViews();
		const primaryView = await setPrimaryView(views);
		await setViewTypes(views);
		await selectFields(views);
	});

	disposable = commands.registerCommand('acumate.buildScreensDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({ devMode: true, cache: buildCommandsCache })
		};
	});

	disposable = commands.registerCommand('acumate.buildScreens', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({ cache: buildCommandsCache })
		};
	});

	disposable = commands.registerCommand('acumate.buildScreensByNamesDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({ devMode: true, byNames: true, cache: buildCommandsCache })
		};
	});

	disposable = commands.registerCommand('acumate.buildScreensByNames', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({ byNames: true, cache: buildCommandsCache })
		};
	});

	disposable = commands.registerCommand('acumate.buildScreensByModulesDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({ devMode: true, byModules: true, cache: buildCommandsCache })
		};
	});

	disposable = commands.registerCommand('acumate.buildScreensByModules', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({ byModules: true, cache: buildCommandsCache })
		};
	});

	disposable = commands.registerCommand('acumate.buildCurrentScreenDev', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({ currentScreen: true, devMode: true })
		};
	});

	disposable = commands.registerCommand('acumate.buildCurrentScreen', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({ currentScreen: true })
		};
	});

	disposable = commands.registerCommand('acumate.repeatLastBuildCommand', async () => {
		buildCommandsCache = { 
			...buildCommandsCache, 
			...await buildScreens({
				noPrompt: true,
				byNames: buildCommandsCache.byNames,
				byModules: buildCommandsCache.byModules,
				cache: buildCommandsCache
			})
		};
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
