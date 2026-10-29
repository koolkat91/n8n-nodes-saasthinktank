import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export const PUBLIC_ENDPOINT = 'https://saasthinktank.com/mcp';
const PROTOCOL = '2025-11-25';
const PRODUCT_IDS = ['base44', 'bubble', 'lovable', 'replit'];
export const QUESTIONS = [
	{ name: 'Backend Connections', value: 'live-fa0bc167dea71cc68dc3c5a5' },
	{ name: 'Built-in Database', value: 'live-23fc696adcb3a494892b6ab2' },
	{ name: 'Code Export', value: 'live-422da707fc95bc9941e612bb' },
	{ name: 'GitHub Sync', value: 'live-ccfc53a9e444044ae679765f' },
];
export type Operation = 'search' | 'get' | 'compare';
type HttpRequest = IExecuteFunctions['helpers']['httpRequest'];
type JsonObject = Record<string, unknown>;
type HttpResponse = { statusCode: number; headers: Record<string, string>; body: unknown };

export class PublicResearchError extends Error {
	constructor(public code: string, message: string, public guidance: string) {
		super(message);
		this.name = 'PublicResearchError';
	}
}

const object = (value: unknown): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function invalid(message: string): never {
	throw new PublicResearchError('INVALID_ARGUMENT', message, 'Check the node parameters and try again.');
}

function products(value: unknown, minimum: number): string[] {
	if (!Array.isArray(value) || value.length < minimum || value.length > 4 ||
		value.some(item => typeof item !== 'string' || !PRODUCT_IDS.includes(item)) ||
		new Set(value).size !== value.length) {
		throw new PublicResearchError('UNSUPPORTED_PRODUCT', 'Choose covered products without duplicates.',
			`Choose ${minimum === 2 ? 'two to four of ' : 'from '}Base44, Bubble, Lovable and Replit.`);
	}
	return value as string[];
}

export function toolArguments(operation: Operation, values: JsonObject): { name: string; arguments: JsonObject } {
	if (operation === 'search') {
		if (typeof values.query !== 'string' || !values.query.trim() || values.query.length > 500 ||
			[...values.query].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
			invalid('Enter a research question of 1–500 characters.');
		if (!Number.isInteger(values.limit) || Number(values.limit) < 1 || Number(values.limit) > 16)
			invalid('Set Limit to a whole number from 1 to 16.');
		const selected = products(values.products, 0);
		return { name: 'search_findings', arguments: {
			query: values.query.trim(), limit: values.limit,
			...(selected.length ? { products: selected } : {}),
		} };
	}
	if (operation === 'get') {
		if (typeof values.recordId !== 'string' || !/^record-[a-f0-9]{64}$/.test(values.recordId))
			invalid('Use the Record ID returned by Search Findings or Compare Products.');
		return { name: 'get_finding', arguments: { record_id: values.recordId } };
	}
	if (operation === 'compare') {
		const selected = products(values.products, 2);
		const questions = values.questions;
		if (!Array.isArray(questions) || questions.length > 4 || new Set(questions).size !== questions.length ||
			questions.some(id => !QUESTIONS.some(question => question.value === id)))
			invalid('Choose questions from the list, without duplicates.');
		return { name: 'compare_products', arguments: {
			products: selected, ...(questions.length ? { capability_ids: questions } : {}),
		} };
	}
	return invalid('Choose Search Findings, Get Finding or Compare Products.');
}

/** Parse the JSON response or a completed Streamable HTTP event response. */
export function parseRpc(body: unknown, id: number): JsonObject {
	let messages: unknown[];
	if (typeof body === 'string') {
		if (body.length > 1024 * 1024) throw new Error('Response is too large.');
		try { messages = [JSON.parse(body)]; }
		catch {
			messages = body.split(/\r?\n\r?\n/).flatMap(event => {
				const data = event.split(/\r?\n/).filter(line => line.startsWith('data:'))
					.map(line => line.slice(5).trimStart()).join('\n');
				return data ? [JSON.parse(data)] : [];
			});
		}
	} else messages = [body];
	const matches = messages.filter(message => object(message) && message.jsonrpc === '2.0' && message.id === id);
	if (matches.length !== 1 || !object(matches[0])) throw new Error('Expected one matching MCP response.');
	return matches[0];
}

/** All traffic goes through n8n's HTTP helper to this one fixed public URL. */
export function createPublicResearchClient(request: HttpRequest, timeout: number, node: INode) {
	if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) invalid('Set Timeout between 1000 and 120000 milliseconds.');
	let ready = false;
	let sessionId: string | undefined;
	let nextId = 1;
	async function send(method: string, params?: JsonObject, notification = false): Promise<JsonObject> {
		const id = notification ? undefined : nextId++;
		const options: IHttpRequestOptions = {
			method: 'POST', url: PUBLIC_ENDPOINT,
			headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
				'MCP-Protocol-Version': PROTOCOL, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) },
			body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, ...(params ? { params } : {}) }),
			json: false, returnFullResponse: true, ignoreHttpStatusErrors: true,
			disableFollowRedirect: true, timeout,
		};
		let response: HttpResponse;
		try { response = await request(options) as HttpResponse; }
		catch {
			throw new NodeOperationError(node, 'The public research service could not be reached.',
				{ description: 'Try again shortly. If the connection is slow, increase Timeout in Options.' });
		}
		if (response.statusCode === 429) throw new PublicResearchError('RATE_LIMITED', 'The public research service is busy.',
			'Wait at least 60 seconds before running this node again.');
		if (response.statusCode < 200 || response.statusCode >= 300)
			throw new PublicResearchError('SERVICE_UNAVAILABLE', 'The public research service is unavailable.',
				'Check https://saasthinktank.com/mcp/health and try again later.');
		if (notification) return {};
		let message: JsonObject;
		try { message = parseRpc(response.body, id!); }
		catch { throw new NodeOperationError(node, 'The service returned an unreadable response.', { description: 'Try again later; no research was returned.' }); }
		if (message.error || !object(message.result))
			throw new PublicResearchError('MCP_REQUEST_REJECTED', 'The service could not complete this research request.',
				'Check the selected operation and its parameters.');
		if (method === 'initialize' && response.headers?.['mcp-session-id'])
			sessionId = response.headers['mcp-session-id'];
		return message.result;
	}
	return {
		async call(tool: { name: string; arguments: JsonObject }): Promise<IDataObject> {
			if (!ready) {
				const initialized = await send('initialize', { protocolVersion: PROTOCOL, capabilities: {},
					clientInfo: { name: 'n8n-nodes-saasthinktank', version: '0.1.0' } });
				if (initialized.protocolVersion !== PROTOCOL || !object(initialized.serverInfo) ||
					initialized.serverInfo.name !== 'com.saasthinktank/evidence')
					throw new PublicResearchError('INCOMPATIBLE_SERVICE', 'The public research connection has changed.',
						'Check for a reviewed connector update before trying again.');
				await send('notifications/initialized', undefined, true);
				ready = true;
			}
			const result = await send('tools/call', tool);
			let data = result.structuredContent;
			if (!object(data) && Array.isArray(result.content)) {
				const text = result.content.find(part => object(part) && part.type === 'text');
				try { data = object(text) && typeof text.text === 'string' ? JSON.parse(text.text) : undefined; }
				catch { data = undefined; }
			}
			if (!object(data) || typeof data.ok !== 'boolean' || !object(data.coverage))
				throw new PublicResearchError('INVALID_RESPONSE', 'The service returned an incomplete research response.',
					'Try again later; no research was returned.');
			if (result.isError || !data.ok) {
				const failure = object(data.error) ? data.error : {};
				throw new PublicResearchError(typeof failure.code === 'string' ? failure.code : 'RESEARCH_UNAVAILABLE',
					typeof failure.message === 'string' ? failure.message : 'This research is unavailable.',
					'Use a covered product, question or Record ID from a previous result.');
			}
			if (!object(data.dataset) || typeof data.dataset.citation !== 'string' || !Array.isArray(data.limitations))
				throw new PublicResearchError('INVALID_RESPONSE', 'The research citation or scope is missing.',
					'Try again later; no research was returned.');
			// Preserve the public answer, dates, conditions, unknowns and sources verbatim.
			return data as IDataObject;
		},
	};
}
