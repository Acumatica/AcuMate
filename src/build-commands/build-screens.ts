import { window } from 'vscode';

const title = 'Build Screens';
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
};

export async function buildScreens(params: IBuildParameters) {
    const terminal = window.createTerminal(title);
    let command = 'npm run build-all';
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

    terminal.sendText(`cd ${getProjectPath()}`);
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

function getProjectPath(): string | undefined {
    const screensPath = 'screen\\src\\screens\\';
    const openedFilePath = window.activeTextEditor?.document.uri.fsPath;
    const projectPathArray = openedFilePath?.split(screensPath);
    const projectPath = projectPathArray ? `${projectPathArray[0]}${screensPath}` : undefined;
    return projectPath;
}

function getOpenedScreenId(): string | undefined {
    const openedFilePath = window.activeTextEditor?.document.uri.fsPath;
    const openedScreenPathArray = openedFilePath?.split('\\');
    const openedScreenId = openedScreenPathArray ? openedScreenPathArray[openedScreenPathArray.length - 1].split('.')[0] : undefined;
    return openedScreenId;
}
