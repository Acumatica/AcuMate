export interface GraphListItem {
	text: string;
	name: string;
}

export interface GraphDto {

}

export interface IScreenDataService {
	checkGraphName(name: string): boolean;
	getGraphInfo(name: string): GraphDto;
}

export enum DecoratorFindResult {
	NoDecorator,
	NoValue,
	Found
}

export type GraphNameFindResult = { status: DecoratorFindResult.NoDecorator | DecoratorFindResult.NoValue } |
	{ status: DecoratorFindResult.Found; name: string };

