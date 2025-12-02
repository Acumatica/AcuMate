import { GraphModel } from '../model/graph-model';
import { AcuMateContext } from '../plugin-context';

let cachedGraphs: GraphModel[] | undefined;
let inflightFetch: Promise<GraphModel[] | undefined> | undefined;

export async function getAvailableGraphs(): Promise<GraphModel[] | undefined> {
	if (cachedGraphs) {
		return cachedGraphs;
	}

	if (inflightFetch) {
		return inflightFetch;
	}

	if (!AcuMateContext.ApiService) {
		return undefined;
	}

	inflightFetch = AcuMateContext.ApiService.getGraphs()
		.then(graphs => {
			cachedGraphs = graphs?.filter(graph => Boolean(graph?.name));
			return cachedGraphs;
		})
		.catch(err => {
			console.error('Error fetching graph metadata:', err);
			return undefined;
		})
		.finally(() => {
			inflightFetch = undefined;
		});

	return inflightFetch;
}

export function primeGraphMetadataCache(graphs: GraphModel[] | undefined) {
	cachedGraphs = graphs;
}

export function clearGraphMetadataCache() {
	cachedGraphs = undefined;
}
