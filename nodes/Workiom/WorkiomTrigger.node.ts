import {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';

const APP_MODES = [
	{
		displayName: 'From List',
		name: 'list',
		type: 'list' as const,
		placeholder: 'Select an app...',
		typeOptions: { searchListMethod: 'searchApps', searchable: true },
	},
	{
		displayName: 'By ID',
		name: 'id',
		type: 'string' as const,
		placeholder: 'e.g. 00000000-0000-0000-0000-000000000000',
	},
];

const LIST_MODES = [
	{
		displayName: 'From List',
		name: 'list',
		type: 'list' as const,
		placeholder: 'Select a list...',
		typeOptions: { searchListMethod: 'searchLists', searchable: true },
	},
	{
		displayName: 'By ID',
		name: 'id',
		type: 'string' as const,
		placeholder: 'e.g. 00000000-0000-0000-0000-000000000000',
	},
];

export class WorkiomTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Workiom Trigger',
		name: 'workiomTrigger',
		icon: 'file:workiom.svg',
		group: ['trigger'],
		version: 1,
		description: 'Triggers when a record is created or updated in Workiom',
		defaults: { name: 'Workiom Trigger' },
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'workiomApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'New Record', value: 'newRecord', description: 'Triggers when a record is created' },
					{ name: 'Updated Record', value: 'updatedRecord', description: 'Triggers when a record is updated' },
				],
				default: 'newRecord',
			},
			{
				displayName: 'App',
				name: 'appId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				modes: APP_MODES,
			},
			{
				displayName: 'List',
				name: 'listId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				modes: LIST_MODES,
			},
			{
				displayName: 'Setup',
				name: 'setup',
				type: 'notice',
				default: '',
				description:
					'Copy the webhook URL above. In Workiom create an Automation → choose the trigger event → add a Webhook action → paste the URL, set Method to <b>POST</b>, Request Type to <b>JSON</b>, and Body to <code>{"record":"{{1. YourListName}}"}</code>',
			},
		],
	};

	methods = {
		listSearch: {
			async searchApps(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const { baseUrl, token } = await getCredentials(this);
				const response = await this.helpers.httpRequest({
					method: 'GET',
					url: `${baseUrl}/api/services/app/Apps/GetAll`,
					headers: { 'X-Api-Key': token },
					json: true,
				});
				const items: IDataObject[] = ((response as IDataObject)?.result as IDataObject)?.items as IDataObject[] ?? [];
				const results = items
					.filter((a) => !filter || (a.name as string).toLowerCase().includes(filter.toLowerCase()))
					.map((a) => ({ name: a.name as string, value: a.id as string }));
				return { results };
			},

			async searchLists(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const { baseUrl, token } = await getCredentials(this);
				const appId = this.getCurrentNodeParameter('appId', { extractValue: true }) as string;
				if (!appId) return { results: [] };
				const response = await this.helpers.httpRequest({
					method: 'GET',
					url: `${baseUrl}/api/services/app/Lists/GetAll`,
					headers: { 'X-Api-Key': token },
					json: true,
					qs: { appId },
				});
				const items: IDataObject[] = ((response as IDataObject)?.result as IDataObject)?.items as IDataObject[] ?? [];
				const results = items
					.filter((l) => !filter || (l.name as string).toLowerCase().includes(filter.toLowerCase()))
					.map((l) => ({ name: l.name as string, value: l.id as string }));
				return { results };
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;

		let records: IDataObject[] = [];

		if (body.record !== undefined) {
			const raw = body.record;
			try {
				const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
				records = Array.isArray(parsed) ? parsed : [parsed];
			} catch {
				records = [body];
			}
		} else {
			records = [body];
		}

		try {
			const listId = this.getNodeParameter('listId', '', { extractValue: true }) as string;
			if (listId) {
				const { baseUrl, token } = await getCredentials(this);
				const fields = await fetchListFields(this, baseUrl, token, listId, true);
				const idToName = buildFieldNameMap(fields);
				records = records.map((r) => renameRecordKeys(r, idToName));
			}
		} catch {
			// Leave records untouched.
		}

		return {
			workflowData: [records.map((r) => ({ json: r }))],
		};
	}
}

async function getCredentials(context: ILoadOptionsFunctions | IWebhookFunctions) {
	const credentials = await context.getCredentials('workiomApi');
	return {
		baseUrl: ((credentials.baseUrl as string) || 'https://api.workiom.com').replace(/\/$/, ''),
		token: credentials.accessToken as string,
	};
}

// Workiom SystemFieldType enum → display name. The API marks system fields only
// via a non-zero systemFieldType (no isSystemField flag).
const SYSTEM_FIELD_NAMES: Record<number, string> = {
	1: 'Creator',
	2: 'Creation Date',
	3: 'Last Updater',
	4: 'Last Modify Date',
	5: 'Last Activity Date',
};

function getFieldName(field: IDataObject): string {
	const sft = field.systemFieldType as number;
	if (sft && SYSTEM_FIELD_NAMES[sft]) return SYSTEM_FIELD_NAMES[sft];
	return (field.name as string) ?? String(field.id);
}

// Map numeric field id → field name. On duplicate names, suffix the id so no
// field value is silently dropped.
function buildFieldNameMap(fields: IDataObject[]): Record<string, string> {
	const map: Record<string, string> = {};
	const seen = new Set<string>();
	for (const f of fields) {
		const id = String(f.id);
		let name = getFieldName(f);
		if (seen.has(name)) name = `${name} (${id})`;
		seen.add(name);
		map[id] = name;
	}
	return map;
}

// Rewrite a record's keys from numeric field ids to field names.
// `_id` is exposed as `id`; per-view metadata is dropped; unmapped keys pass through.
function renameRecordKeys(record: IDataObject, idToName: Record<string, string>): IDataObject {
	if (record == null || typeof record !== 'object') return record;
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(record)) {
		if (key.startsWith('view-')) continue;
		const mapped = key === '_id' ? 'id' : (idToName[key] ?? key);
		out[mapped] = value;
	}
	return out;
}

async function fetchListFields(
	context: IWebhookFunctions,
	baseUrl: string,
	token: string,
	listId: string,
	includeSystemFields = false,
): Promise<IDataObject[]> {
	const response = await context.helpers.httpRequest({
		method: 'GET',
		url: `${baseUrl}/api/services/app/Lists/Get`,
		headers: { 'X-Api-Key': token },
		json: true,
		qs: { id: listId, expand: 'fields', ...(includeSystemFields ? { includeSystemFields: true } : {}) },
	});
	return ((response as IDataObject)?.result as IDataObject)?.fields as IDataObject[] ?? [];
}
