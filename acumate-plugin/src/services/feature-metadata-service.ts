import { FeatureModel } from '../model/FeatureModel';
import { AcuMateContext } from '../plugin-context';

let cachedFeatures: FeatureModel[] | undefined;
let inflightFetch: Promise<FeatureModel[] | undefined> | undefined;

export async function getAvailableFeatures(): Promise<FeatureModel[] | undefined> {
	if (cachedFeatures) {
		return cachedFeatures;
	}

	if (inflightFetch) {
		return inflightFetch;
	}

	if (!AcuMateContext.ApiService) {
		return undefined;
	}

	inflightFetch = AcuMateContext.ApiService.getFeatures()
		.then(features => {
			if (!Array.isArray(features)) {
				return undefined;
			}

			cachedFeatures = features.filter(feature => Boolean(feature?.featureName));
			return cachedFeatures;
		})
		.catch(err => {
			console.error('Error fetching feature metadata:', err);
			return undefined;
		})
		.finally(() => {
			inflightFetch = undefined;
		});

	return inflightFetch;
}

export function primeFeatureMetadataCache(features: FeatureModel[] | undefined) {
	cachedFeatures = features;
}

export function clearFeatureMetadataCache() {
	cachedFeatures = undefined;
}
