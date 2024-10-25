import { QuickPickItem, QuickPickItemKind, window } from 'vscode';
import * as fs from 'fs';

const title = 'Build Screens';
const buildCommands = [
    {
        command: 'acumate.watchCurrentScreen',
        description: 'Watch Current Screen',
    },
    {
        command: 'acumate.buildCurrentScreenDev',
        description: 'Build Current Screen (Dev)',
    },
    {
        command: 'acumate.buildCurrentScreen',
        description: 'Build Current Screen (Production)',
    },
    {
        separator: true,
    },
    {
        command: 'acumate.buildScreensDev',
        description: 'Build Screens (Dev)',
    },
    {
        command: 'acumate.buildScreensByNamesDev',
        description: 'Build Screens by Names (Dev)',
    },
    {
        command: 'acumate.buildScreensByModulesDev',
        description: 'Build Screens by Modules (Dev)',
    },
    {
        separator: true,
    },
    {
        command: 'acumate.buildScreens',
        description: 'Build Screens (Production)',
    },
    {
        command: 'acumate.buildScreensByNames',
        description: 'Build Screens by Names (Production)',
    },
    {
        command: 'acumate.buildScreensByModules',
        description: 'Build Screens by Modules (Production)',
    },
    {
        separator: true,
    },
    {
        command: 'acumate.repeatLastBuildCommand',
        description: 'Repeat Last Build Command',
    },
];

const getModulesCommand = 'npm run getmodules';

export type CommandsCache = {
    lastEnteredNames?: string;
    lastEnteredModules?: string;
    devMode?: boolean;
    byNames?: boolean;
    byModules?: boolean;
    currentScreen?: boolean;
}

interface IBuildParameters {
    devMode?: boolean;
    byNames?: boolean;
    byModules?: boolean;
    cache?: CommandsCache;
    currentScreen?: boolean;
    noPrompt?: boolean;
    watch?: boolean;
};

export async function openBuildMenu() {
    const result = await window.showQuickPick<QuickPickItem>(buildCommands.map(item => ({
        label: item.description,
        kind: item.separator ? QuickPickItemKind.Separator : QuickPickItemKind.Default,
    } as QuickPickItem)), {
        title,
    });

    if (!result) {
        return;
    }
    return buildCommands.find(item => item.description === result.label)?.command;
}

export async function buildScreens(params: IBuildParameters) {
    const terminal = window.createTerminal(title);
    let command = `npm run ${params.watch ? 'watch' : 'build'}`; // include build-all option?
    let result;
    
    if (params.devMode) {
        command += '-dev';
    }

    if (params.currentScreen) {
        command += ` -- --env screenIds=${getOpenedScreenId()}`;
    }

    else if (params.byNames) {
        const prompt = 'Enter screen IDs separated by commas';
        const placeHolder = 'XXXXXXXX, YYYYYYYY, ...';
        if (!params.noPrompt) {
            result = await window.showInputBox({
                title,
                placeHolder,
                prompt,
                value: params.cache?.lastEnteredNames,
            });
        }
        else {
            result = params.cache?.lastEnteredNames;
        }
        command += ` -- --env screenIds=${result}`;
    } 

    else if (params.byModules) {
        const prompt = 'Enter screen modules separated by commas';
        const placeHolder = 'XX, YY, ...';
        if (!params.noPrompt) {
            result = await window.showInputBox({
                title,
                placeHolder,
                prompt,
                value: params.cache?.lastEnteredModules,
            });
        }
        else {
            result = params.cache?.lastEnteredModules;
        }
        command += ` -- --env modules=${result}`;
    }

    if (!nodeModulesExists()) {
        terminal.sendText(`cd ${getFrontendSourcesPath()}`);
        terminal.sendText(getModulesCommand);
    }

    terminal.sendText(`cd ${getScreensSrcPath()}`);
    terminal.sendText(command);
    terminal.show();

    const cache: CommandsCache = {};
    if (params.currentScreen) {
        cache.currentScreen = true;
        cache.byNames = false;
        cache.byModules = false;
    }
    else if (params.byNames) {
        cache.lastEnteredNames = result;
        cache.byNames = true;
        cache.byModules = false;
    }
    else if (params.byModules) {
        cache.lastEnteredModules = result;
        cache.byModules = true;
        cache.byNames = false;
    }
    else {
        cache.currentScreen = false;
        cache.byNames = false;
        cache.byModules = false;
    }
    
    return cache;
}

const screensPath = 'screen\\src\\screens\\';

function getFrontendSourcesPath(): string | undefined {
    const openedFilePath = window.activeTextEditor?.document.uri.fsPath;
    const pathArray = openedFilePath?.split(screensPath);
    const path = pathArray ? pathArray[0] : undefined;
    return path;
}

function getScreenAppPath(): string | undefined {
    const frontendSourcesPath = getFrontendSourcesPath();
    const path = frontendSourcesPath ? `${frontendSourcesPath}screen` : undefined;
    return path;
}

function getScreensSrcPath(): string | undefined {
    const frontendSourcesPath = getFrontendSourcesPath();
    const path = frontendSourcesPath ? `${frontendSourcesPath}${screensPath}` : undefined;
    return path;
}

function getOpenedScreenId(): string | undefined {
    const openedFilePath = window.activeTextEditor?.document.uri.fsPath;
    const openedScreenPathArray = openedFilePath?.split('\\');
    const openedScreenId = openedScreenPathArray ? openedScreenPathArray[openedScreenPathArray.length - 1].split('.')[0] : undefined;
    return openedScreenId;
}

function nodeModulesExists(): boolean {
    const path = `${getScreenAppPath()}\\node_modules`;
    return fs.existsSync(path);
}