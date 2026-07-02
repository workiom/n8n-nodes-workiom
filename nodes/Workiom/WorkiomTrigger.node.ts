import {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	NodeConnectionTypes,
	NodeOperationError,
	IWebhookResponseData,
} from 'n8n-workflow';

import { FT, fetchListFields, fetchUserOptions, getCredentials, transformRecordFields } from './GenericFunctions';

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
		icon: { light: 'file:workiom.svg', dark: 'file:workiom.dark.svg' },
		group: ['trigger'],
		version: 1,
		description: 'Triggers when a record is created or updated in Workiom',
		subtitle: '={{$parameter["event"] === "newRecord" ? "New Record" : "Updated Record"}}',
		defaults: { name: 'Workiom Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'workiomApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
				// The subscription is registered automatically on activation, so the
				// user never needs to copy this URL — hide the NDV webhook-URL panel.
				ndvHideUrl: true,
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
		],
		usableAsTool: true,
	};

	webhookMethods = {
		default: {
			checkExists: async function(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				return !!staticData.subscriptionId;
			},
			create: async function(this: IHookFunctions): Promise<boolean> {
				const { baseUrl, token } = await getCredentials(this);
				const appId = this.getNodeParameter('appId', '', { extractValue: true }) as string;
				const listId = this.getNodeParameter('listId', '', { extractValue: true }) as string;
				const event = this.getNodeParameter('event') as string;
				const webhookUrl = this.getNodeWebhookUrl('default');

				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${baseUrl}/api/services/app/WebhookSubscription/AddSubscription`,
					headers: { 'X-Api-Key': token },
					json: true,
					body: {
						appId,
						listId,
						name: event === 'newRecord' ? 'n8n - New Record' : 'n8n - Updated Record',
						isActive: true,
						webHook: webhookUrl,
						integrationType: 0,
						eventType: event === 'newRecord' ? 0 : 1,
					},
				});

				// AddSubscription's exact response shape wasn't verifiable against a live
				// tenant (see design doc Risk section) — check both a wrapped ABP
				// `result.id` and an unwrapped top-level `id`.
				const result = (response as IDataObject)?.result as IDataObject | undefined;
				const subscriptionId = result?.id ?? (response as IDataObject)?.id;
				if (!subscriptionId) {
					throw new NodeOperationError(this.getNode(), 'Workiom did not return a subscription id for the new webhook');
				}

				const staticData = this.getWorkflowStaticData('node');
				staticData.subscriptionId = subscriptionId;
				return true;
			},
			delete: async function(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const subscriptionId = staticData.subscriptionId;
				if (!subscriptionId) return true;

				try {
					const { baseUrl, token } = await getCredentials(this);
					await this.helpers.httpRequest({
						method: 'DELETE',
						url: `${baseUrl}/api/services/app/Integration/Delete`,
						headers: { 'X-Api-Key': token },
						json: true,
						body: { id: subscriptionId },
					});
				} catch (error) {
					this.logger.warn(`Failed to remove Workiom webhook subscription ${subscriptionId as string}: ${(error as Error).message}`);
				} finally {
					delete staticData.subscriptionId;
				}

				return true;
			},
		},
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
		let body: IDataObject = {};
		try {
			body = this.getBodyData() as IDataObject;
		} catch {
			// Malformed body — nothing to transform, but never throw out of a webhook handler.
		}
		const recordId = (body._id ?? body.id) as string | undefined;

		let record: IDataObject = body;
		let fields: IDataObject[] = [];
		let userOptions: INodePropertyOptions[] = [];

		try {
			const listId = this.getNodeParameter('listId', '', { extractValue: true }) as string;
			const { baseUrl, token } = await getCredentials(this);

			// The native webhook payload is thin (often just `_id`) — refetch the
			// full record rather than trusting the body to carry every field.
			if (recordId && listId) {
				try {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/services/app/Data/Get`,
						headers: { 'X-Api-Key': token },
						json: true,
						qs: { listId, id: recordId },
					});
					const fetched = (response as IDataObject)?.result as IDataObject;
					if (fetched) record = fetched;
				} catch {
					// Record may have been deleted between the event firing and this
					// refetch — fall back to transforming whatever the body carried.
				}
			}

			fields = await fetchListFields(this, baseUrl, token, listId, true);
			if (fields.some((f) => f.dataType === FT.User || f.dataType === FT.MultiUser)) {
				userOptions = await fetchUserOptions(this, baseUrl, token);
			}
		} catch {
			// Credential/parameter resolution failed (e.g. a revoked API key) —
			// degrade to transforming the raw body with no field-name mapping
			// rather than crashing the webhook endpoint.
		}

		return {
			workflowData: [[{ json: transformRecordFields(record, fields, userOptions) }]],
		};
	}
}
