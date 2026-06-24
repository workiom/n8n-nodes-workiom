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

		return {
			workflowData: [records.map((r) => ({ json: r }))],
		};
	}
}

async function getCredentials(context: ILoadOptionsFunctions) {
	const credentials = await context.getCredentials('workiomApi');
	return {
		baseUrl: ((credentials.baseUrl as string) || 'https://api.workiom.com').replace(/\/$/, ''),
		token: credentials.accessToken as string,
	};
}
