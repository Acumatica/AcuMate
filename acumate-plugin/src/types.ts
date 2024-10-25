import { Field } from "./model/view";

export class View {
    constructor(name: string) {
        this.name = name;
    }

    name!: string;
    dacname?: string;
    type?: ViewType;
    fields?: Field[];

    get isEntity() {
        return this.type === 'entity';
    }

    get isGrid() {
        return this.type === 'grid';
    }

    get isTree() {
        return this.type === 'tree';
    }
};

export class Action {
    constructor(name: string) {
        this.name = name;
    }

    name!: string;
}

export type ViewType = 'entity' | 'grid' | 'tree';