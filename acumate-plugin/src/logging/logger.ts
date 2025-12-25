import vscode from 'vscode';

let logChannel: vscode.LogOutputChannel | undefined;

function getLogChannel(): vscode.LogOutputChannel {
	if (!logChannel) {
		logChannel = vscode.window.createOutputChannel('AcuMate', { log: true });
	}

	return logChannel;
}

export function registerLogger(context: vscode.ExtensionContext): void {
	const channel = getLogChannel();
	context.subscriptions.push(channel);
}

export function logInfo(message: string, details?: Record<string, unknown> | unknown): void {
	getLogChannel().info(message, ...(details ? [details] : []));
}

export function logWarn(message: string, details?: Record<string, unknown> | unknown): void {
	getLogChannel().warn(message, ...(details ? [details] : []));
}

export function logError(message: string, details?: Record<string, unknown> | unknown): void {
	getLogChannel().error(message, ...(details ? [details] : []));
}
