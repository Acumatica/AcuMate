export interface IView {
    name: string;
    type?: ViewType;
    fields?: string[];
};

export type ViewType = 'entity' | 'grid' | 'tree';