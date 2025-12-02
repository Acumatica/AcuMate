import { GraphStructure } from './model/graph-structure';
import { Field, View } from './model/view';

export interface BackendFieldMetadata {
	fieldName: string;
	normalizedName: string;
	field: Field;
}

export interface BackendViewMetadata {
	viewName: string;
	normalizedName: string;
	view: View;
	fields: Map<string, BackendFieldMetadata>;
}

export function normalizeMetaName(value: string | undefined): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	return normalized.length ? normalized : undefined;
}

export function buildBackendActionSet(structure: GraphStructure | undefined): Set<string> {
	const actions = new Set<string>();
	if (!structure?.actions) {
		return actions;
	}

	for (const action of structure.actions) {
		const normalized = normalizeMetaName(action?.name);
		if (normalized) {
			actions.add(normalized);
		}
	}

	return actions;
}

export function buildBackendViewMap(structure: GraphStructure | undefined): Map<string, BackendViewMetadata> {
	const views = new Map<string, BackendViewMetadata>();
	if (!structure?.views) {
		return views;
	}

	for (const [key, view] of Object.entries(structure.views)) {
		if (!view) {
			continue;
		}

		const normalizedKey = normalizeMetaName(key);
		const normalizedName = normalizeMetaName(view.name) ?? normalizedKey;
		const lookupKey = normalizedName ?? normalizedKey;
		if (!lookupKey) {
			continue;
		}

		const metadata: BackendViewMetadata = {
			viewName: view.name ?? key,
			normalizedName: lookupKey,
			view,
			fields: buildBackendFieldMap(view),
		};

		views.set(lookupKey, metadata);
		if (normalizedKey && normalizedKey !== lookupKey && !views.has(normalizedKey)) {
			views.set(normalizedKey, metadata);
		}
	}

	return views;
}

export function buildBackendFieldMap(view: View | undefined): Map<string, BackendFieldMetadata> {
	const fields = new Map<string, BackendFieldMetadata>();
	if (!view?.fields) {
		return fields;
	}

	for (const [key, field] of Object.entries(view.fields)) {
		if (!field) {
			continue;
		}

		const normalizedKey = normalizeMetaName(key);
		const normalizedName = normalizeMetaName(field.name) ?? normalizedKey;
		const lookupKey = normalizedName ?? normalizedKey;
		if (!lookupKey) {
			continue;
		}

		const metadata: BackendFieldMetadata = {
			fieldName: field.name ?? key,
			normalizedName: lookupKey,
			field,
		};

		fields.set(lookupKey, metadata);
		if (normalizedKey && normalizedKey !== lookupKey && !fields.has(normalizedKey)) {
			fields.set(normalizedKey, metadata);
		}
	}

	return fields;
}
