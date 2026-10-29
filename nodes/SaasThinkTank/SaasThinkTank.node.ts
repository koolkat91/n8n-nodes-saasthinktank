import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { createPublicResearchClient, PublicResearchError, QUESTIONS, toolArguments, type Operation } from './publicResearch';

const productOptions = [
	{ name: 'Base44', value: 'base44' }, { name: 'Bubble', value: 'bubble' },
	{ name: 'Lovable', value: 'lovable' }, { name: 'Replit', value: 'replit' },
];

export class SaasThinkTank implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SaaS Think Tank', name: 'saasThinkTank',
		icon: { light: 'file:saasthinktank.svg', dark: 'file:saasthinktank.dark.svg' },
		group: ['input'], version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Search and compare published software research',
		defaults: { name: 'SaaS Think Tank' },
		inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main], usableAsTool: true,
		properties: [
			{ displayName: 'This edition covers 16 published findings about Base44, Bubble, Lovable and Replit. Dates and limits stay with every answer. No login is needed.',
				name: 'coverageNotice', type: 'notice', default: '' },
			{ displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
				options: [
					{ name: 'Compare Products', value: 'compare', description: 'Compare published findings for two to four products', action: 'Compare products' },
					{ name: 'Get Finding', value: 'get', description: 'Retrieve one published finding with its sources and limits', action: 'Get finding' },
					{ name: 'Search Findings', value: 'search', description: 'Search dated published findings by question', action: 'Search findings' },
				], default: 'search' },
			{ displayName: 'Question', name: 'query', type: 'string', default: '', required: true,
				placeholder: 'e.g. Can Bubble and Lovable export source code?',
				description: 'A question about code export, GitHub sync, backend connections or built-in databases',
				displayOptions: { show: { operation: ['search'] } } },
			{ displayName: 'Products', name: 'products', type: 'multiOptions', options: productOptions, default: [],
				description: 'Products to search. Leave empty to search all covered products.',
				displayOptions: { show: { operation: ['search'] } } },
			{ displayName: 'Maximum Findings', name: 'maxFindings', type: 'number', typeOptions: { minValue: 1, maxValue: 16, numberPrecision: 0 },
				default: 16, description: 'Max number of results to return', displayOptions: { show: { operation: ['search'] } } },
			{ displayName: 'Record ID', name: 'recordId', type: 'string', default: '', required: true,
				description: 'The exact record_id returned by Search Findings or Compare Products',
				displayOptions: { show: { operation: ['get'] } } },
			{ displayName: 'Products', name: 'productsToCompare', type: 'multiOptions', options: productOptions,
				default: ['bubble', 'lovable'], required: true, description: 'Choose two to four covered products',
				displayOptions: { show: { operation: ['compare'] } } },
			{ displayName: 'Questions', name: 'questions', type: 'multiOptions', options: QUESTIONS, default: [],
				description: 'Questions to compare. Leave empty to include all four covered questions.',
				displayOptions: { show: { operation: ['compare'] } } },
			{ displayName: 'Options', name: 'options', type: 'collection', placeholder: 'Add Option', default: {},
				options: [ { displayName: 'Timeout', name: 'timeout', type: 'number', default: 60000,
					typeOptions: { minValue: 1000, maxValue: 120000, numberPrecision: 0 },
					description: 'Time in milliseconds to wait for each public research request' } ] },
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		// One fixed endpoint and one handshake per node execution; no cache crosses runs.
		const options = this.getNodeParameter('options', 0) as { timeout?: number };
		const client = createPublicResearchClient(this.helpers.httpRequest.bind(this.helpers), options.timeout ?? 60000, this.getNode());
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as Operation;
				const values = operation === 'search' ? {
					query: this.getNodeParameter('query', itemIndex),
					products: this.getNodeParameter('products', itemIndex), limit: this.getNodeParameter('maxFindings', itemIndex),
				} : operation === 'get' ? { recordId: this.getNodeParameter('recordId', itemIndex) } : {
					products: this.getNodeParameter('productsToCompare', itemIndex), questions: this.getNodeParameter('questions', itemIndex),
				};
				const json = await client.call(toolArguments(operation, values));
				output.push({ json, pairedItem: { item: itemIndex } });
			} catch (cause) {
				if (cause instanceof NodeOperationError && !this.continueOnFail())
					throw new NodeOperationError(this.getNode(), cause.message, { description: cause.description ?? undefined, itemIndex });
				const error = cause instanceof PublicResearchError ? cause : new PublicResearchError('RESEARCH_UNAVAILABLE',
					'This research request could not be completed.', 'Check the node parameters and try again later.');
				if (this.continueOnFail()) {
					output.push({ json: { ok: false, error: { code: error.code, message: error.message, guidance: error.guidance } }, pairedItem: { item: itemIndex } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error.message, { description: error.guidance, itemIndex });
			}
		}
		return [output];
	}
}
