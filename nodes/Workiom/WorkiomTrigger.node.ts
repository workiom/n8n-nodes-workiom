import {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	IWebhookResponseData,
} from 'n8n-workflow';

import { FT, fetchListFields, fetchUserOptions, getCredentials, renameRecordFields, transformRecordFields } from './GenericFunctions';

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
			{
				displayName: 'Advanced Output',
				name: 'advancedOutput',
				type: 'boolean',
				default: false,
				description:
					'Whether to return the raw record — field names with unprocessed values (select/user fields as objects/IDs, dates as raw strings) — instead of the friendly, type-formatted output',
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
				const listId = this.getNodeParameter('listId', '', { extractValue: true }) as string;
				const event = this.getNodeParameter('event') as string;
				const eventType = event === 'newRecord' ? 0 : 1;
				const body = {
					appId: this.getNodeParameter('appId', '', { extractValue: true }) as string,
					listId,
					name: event === 'newRecord' ? 'n8n - New Record' : 'n8n - Updated Record',
					isActive: true,
					webHook: this.getNodeWebhookUrl('default'),
					integrationType: 0,
					eventType,
				};
				const addSubscription = () =>
					this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/services/app/WebhookSubscription/AddSubscription`,
						headers: { 'X-Api-Key': token },
						json: true,
						body,
					});

				let response: unknown;
				try {
					response = await addSubscription();
				} catch (error) {
					if (!subscriptionAlreadyExists(error)) {
						// Surface Workiom's actual response body in n8n's error UI.
						throw new NodeApiError(this.getNode(), error as JsonObject);
					}
					// Workiom allows only one webhook per (list, event type). A leftover
					// subscription (e.g. a prior run whose URL is now dead) holds the slot.
					// Reclaim it: remove the existing one and re-add with this node's
					// current URL so events actually reach us.
					const existingId = await findSubscriptionId(this, baseUrl, token, listId, eventType);
					if (existingId) {
						await deleteSubscription(this, baseUrl, token, existingId).catch(() => false);
					}
					try {
						response = await addSubscription();
					} catch (retryError) {
						if (subscriptionAlreadyExists(retryError)) {
							// Could not reclaim the slot; reuse whatever is registered, but still
							// record its id so delete() can remove it when the node is removed.
							const staleId = existingId ?? (await findSubscriptionId(this, baseUrl, token, listId, eventType));
							if (staleId) {
								this.getWorkflowStaticData('node').subscriptionId = staleId;
							}
							this.logger.warn(
								'Reusing an existing Workiom webhook subscription. If events do not arrive, remove it in Workiom and re-activate.',
							);
							return true;
						}
						throw new NodeApiError(this.getNode(), retryError as JsonObject);
					}
				}

				// ABP wraps the created entity as { result: { id, ... }, success: true }.
				const result = (response as IDataObject)?.result as IDataObject | undefined;
				const subscriptionId = result?.id ?? (response as IDataObject)?.id;
				if (!subscriptionId) {
					throw new NodeOperationError(this.getNode(), 'Workiom did not return a subscription id for the new webhook');
				}

				this.getWorkflowStaticData('node').subscriptionId = subscriptionId;
				return true;
			},
			delete: async function(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const subscriptionId = staticData.subscriptionId as string | undefined;
				if (!subscriptionId) return true;

				try {
					const { baseUrl, token } = await getCredentials(this);
					const confirmed = await deleteSubscription(this, baseUrl, token, subscriptionId);
					if (!confirmed) {
						this.logger.warn(
							`Workiom did not confirm removal of webhook subscription ${subscriptionId}; it may need to be removed manually in Workiom.`,
						);
					}
				} catch (error) {
					this.logger.warn(
						`Failed to remove Workiom webhook subscription ${subscriptionId}: ${(error as Error).message}`,
					);
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
		let advancedOutput = false;

		try {
			const listId = this.getNodeParameter('listId', '', { extractValue: true }) as string;
			advancedOutput = this.getNodeParameter('advancedOutput', false) as boolean;
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
			// Advanced Output keeps raw values, so it never needs user resolution.
			if (!advancedOutput && fields.some((f) => f.dataType === FT.User || f.dataType === FT.MultiUser)) {
				userOptions = await fetchUserOptions(this, baseUrl, token);
			}
		} catch {
			// Credential/parameter resolution failed (e.g. a revoked API key) —
			// degrade to transforming the raw body with no field-name mapping
			// rather than crashing the webhook endpoint.
		}

		const json = advancedOutput
			? renameRecordFields(record, fields)
			: transformRecordFields(record, fields, userOptions);

		return {
			workflowData: [[{ json }]],
		};
	}
}

// Detect Workiom's "one webhook per list + event type" conflict from a failed
// AddSubscription (error code `WebHookWithSameListAndEventTypeAlreadyExists`) so
// create() can treat the slot as already registered instead of failing.
function subscriptionAlreadyExists(error: unknown): boolean {
	const e = error as { response?: { data?: unknown; body?: unknown }; cause?: unknown; message?: string };
	const body = JSON.stringify(e.response?.data ?? e.response?.body ?? e.cause ?? e.message ?? '');
	return body.includes('WebHookWithSameListAndEventTypeAlreadyExists');
}

// Find the id of an existing webhook subscription for a list + event type, so a
// leftover subscription can be removed before re-registering.
async function findSubscriptionId(
	ctx: IHookFunctions,
	baseUrl: string,
	token: string,
	listId: string,
	eventType: number,
): Promise<string | undefined> {
	try {
		const res = await ctx.helpers.httpRequest({
			method: 'GET',
			url: `${baseUrl}/api/services/app/WebhookSubscription/GetAllSubscriptions`,
			headers: { 'X-Api-Key': token },
			json: true,
		});
		const items = ((res as IDataObject)?.result as IDataObject)?.items as IDataObject[] ?? [];
		const match = items.find(
			(sub) => String(sub.listId) === String(listId) && Number(sub.eventType) === Number(eventType),
		);
		return match ? String(match.id) : undefined;
	} catch {
		return undefined;
	}
}

// Remove a webhook subscription by id. Returns true only if Workiom confirms it
// via the ABP `success` flag; a 404/HTML body counts as not removed.
async function deleteSubscription(
	ctx: IHookFunctions,
	baseUrl: string,
	token: string,
	subscriptionId: string,
): Promise<boolean> {
	const res = await ctx.helpers.httpRequest({
		method: 'DELETE',
		url: `${baseUrl}/api/services/app/WebhookSubscription/DeleteSubscription`,
		headers: { 'X-Api-Key': token },
		json: true,
		qs: { subscriptionId },
	});
	return !!res && typeof res === 'object' && (res as IDataObject).success === true;
}
