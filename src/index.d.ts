/**
 * 3. The Personal Brain Agent
 */
export declare class PersonalBrain {
    private model;
    private docClient;
    private tools;
    private graph;
    constructor();
    initialize(): Promise<void>;
    ask(userInput: string): Promise<any>;
}
//# sourceMappingURL=index.d.ts.map