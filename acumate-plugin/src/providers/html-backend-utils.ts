import { CollectedClassInfo, tryGetGraphType, tryGetGraphTypeFromExtension } from '../utils';
import { AcuMateContext } from '../plugin-context';
import { buildBackendViewMap, BackendFieldMetadata, normalizeMetaName } from '../backend-metadata-utils';

function resolveGraphName(screenClasses: CollectedClassInfo[]): string | undefined {
	for (const screenClass of screenClasses) {
		const sourceText = screenClass.sourceFile.getFullText?.() ?? screenClass.sourceFile.text;
		const graphType = tryGetGraphType(sourceText);
		if (graphType) {
			return graphType;
		}
	}
	for (const screenClass of screenClasses) {
		const fromExt = tryGetGraphTypeFromExtension(screenClass.sourceFile.fileName);
		if (fromExt) {
			return fromExt;
		}
	}
	return undefined;
}

export async function loadBackendFieldsForView(
	viewName: string,
	screenClasses: CollectedClassInfo[]
): Promise<Map<string, BackendFieldMetadata> | undefined> {
	if (!AcuMateContext.ConfigurationService?.useBackend || !AcuMateContext.ApiService) {
		return undefined;
	}

	const graphName = resolveGraphName(screenClasses);
	if (!graphName) {
		return undefined;
	}

	const graphStructure = await AcuMateContext.ApiService.getGraphStructure(graphName);
	if (!graphStructure) {
		return undefined;
	}

	const normalizedViewName = normalizeMetaName(viewName);
	if (!normalizedViewName) {
		return undefined;
	}

	const backendViews = buildBackendViewMap(graphStructure);
	return backendViews.get(normalizedViewName)?.fields;
}
